import os, json, base64, re, logging, hashlib
from datetime import datetime
from io import BytesIO
from collections import defaultdict
import cv2, numpy as np, pypdfium2 as pdfium
from PIL import Image
from openai import OpenAI
from celery_app import app
from db import SessionLocal
from models import (
    UploadMetadata, ExtractedDocs, WeighmentSlip, LinkedTrip,
    TripDocument, ExtractedPage, DealerSummary, User
)

logger = logging.getLogger(__name__)
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

class DocumentProcessingError(Exception):
    pass


# ---------------- PDF → Image ----------------
def convert_pdf_to_images(pdf_bytes: bytes, dpi: int = 300):
    pdf = pdfium.PdfDocument(pdf_bytes)
    return [pdf.get_page(i).render(scale=dpi / 72).to_pil() for i in range(len(pdf))]


def image_to_base64(img):
    buf = BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


# ---------------- Data Cleaning ----------------
def clean_location(text):
    if not text or text in ["N/A", None]:
        return text
    text = re.sub(r"^[A-Z0-9]{3,6}[, ]+", "", text)
    text = re.sub(r"^\d+[ ,]*", "", text)
    return " ".join(w.capitalize() for w in text.split())


def extract_single_date(raw_date):
    """Extract and normalize first valid date from text"""
    if not raw_date:
        return None
    candidates = re.findall(r'\d{1,2}[-./]\d{1,2}[-./]\d{2,4}', raw_date)
    for date_str in candidates:
        date_str = date_str.replace(".", "-").replace("/", "-")
        for fmt in ("%d-%m-%Y", "%Y-%m-%d", "%d-%m-%y", "%d-%b-%Y"):
            try:
                return datetime.strptime(date_str, fmt).strftime("%Y-%m-%d")
            except:
                continue
    return None


def normalize_record(r):
    """Standardize key fields"""
    if r.get("Vehicle_No"):
        v = re.sub(r"[^A-Z0-9]", "", r["Vehicle_No"].upper())
        r["Vehicle_No"] = v if len(v) >= 6 else None

    if r.get("LR_No"):
        r["LR_No"] = r["LR_No"].upper().replace(" ", "").replace("CL/BL", "CL/BI")

    if r.get("Invoice_No"):
        r["Invoice_No"] = r["Invoice_No"].upper().replace(" ", "")

    for dkey in ["LR_Date", "Invoice_Date"]:
        raw = r.get(dkey)
        if raw and str(raw).strip():
            clean_date = extract_single_date(str(raw))
            r[dkey] = clean_date if clean_date else None
        else:
            r[dkey] = None

    for f in ["Origin", "Destination"]:
        if r.get(f):
            val = str(r[f])
            r[f] = clean_location(val)

    for f in ["Bill_To_Party", "Ship_To_Party", "Principal_Company"]:
        if r.get(f) and r[f] not in ["N/A", None]:
            r[f] = " ".join(w.capitalize() for w in str(r[f]).split())

    return r


# ---------------- Field Fixes ----------------
def fix_missing_fields(r):
    if not r.get("LR_No"):
        r["LR_No"] = None
    if r.get("Order_Type") == "BAG":
        r["Origin_Weighment_Slip"] = "Not Present"
        r["Site_Weighment_Slip"] = "Not Present"
    return r


# ---------------- Stamp Detection ----------------
def detect_stamps(img):
    try:
        arr = np.array(img)
        hsv = cv2.cvtColor(arr, cv2.COLOR_RGB2HSV)
        mask = cv2.inRange(hsv, (0, 50, 50), (10, 255, 255)) + cv2.inRange(hsv, (170, 50, 50), (180, 255, 255))
        if cv2.countNonZero(mask) > 150:
            return "YES"
        return "NO"
    except:
        return "N/A"


# ---------------- OCR Extraction ----------------
def alias(d, keys):
    for k in keys:
        if d.get(k):
            return d[k]
    return None


def clean_veh(v):
    if not v:
        return None
    v = re.sub(r'[^A-Z0-9]', '', v.upper())
    return v if re.match(r'^[A-Z]{2}\d{2}[A-Z]{1,3}\d{3,4}$', v) else None


def extract_logistics_fields(image, page, stamp):
    """Call OpenAI OCR"""
    b64 = image_to_base64(image)
    system_msg = "You are OCR for cement logistics."
    prompt = "Return JSON: LR_No, Invoice_No, Vehicle_No, LR_Date, Invoice_Date, Bill_To, Ship_To, Origin, Destination, Principal_Company, Quantity (MT), Doc_Type, Other_Text"

    r = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_msg},
            {"role": "user", "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}}
            ]}
        ],
        response_format={"type": "json_object"}
    )

    if not r.choices or not r.choices[0].message.content:
        return {"Invoice_No": None, "Vehicle_No": None, "LR_No": None, "Order_Type": "BAG"}

    raw = json.loads(r.choices[0].message.content)
    text = raw.get("Other_Text", "")

    result = {
        "LR_No": alias(raw, ["LR_No", "LR"]),
        "Invoice_No": alias(raw, ["Invoice_No", "Invoice No"]),
        "Vehicle_No": clean_veh(alias(raw, ["Vehicle_No", "Truck No"])),
        "LR_Date": raw.get("LR_Date"),
        "Invoice_Date": raw.get("Invoice_Date"),
        "Bill_To_Party": alias(raw, ["Bill_To", "Consignee"]),
        "Ship_To_Party": alias(raw, ["Ship_To", "Delivery"]),
        "Origin": alias(raw, ["Origin", "From"]),
        "Destination": alias(raw, ["Destination", "To"]),
        "Principal_Company": raw.get("Principal_Company") or "Unknown",
        "Acknowledgement_Status": stamp,
        "Order_Type": "BULK" if "MT" in str(raw.get("Quantity", "")).upper() else "BAG",
        "OTHER": text,
    }
    return result


# ---------------- Utility ----------------
def compute_file_hash(binary_data: bytes) -> str:
    return hashlib.sha256(binary_data).hexdigest()


# ---------------- Celery Task ----------------
@app.task(bind=True, name="process_document")
def process_document_task(self, file_content_b64, original_filename):
    db_session = SessionLocal()
    final_records_with_id = []

    try:
        binary = base64.b64decode(file_content_b64)
        file_hash = compute_file_hash(binary)
        logger.info(f"🔍 Computed file hash for {original_filename}: {file_hash}")

        # Avoid duplicate uploads
        if db_session.query(UploadMetadata).filter_by(file_hash=file_hash).first():
            logger.warning(f"⚠️ Duplicate file detected: {original_filename}")
            return {"status": "SKIPPED", "reason": "Duplicate file"}

        imgs = [Image.open(BytesIO(binary)).convert("RGB")] if original_filename.lower().endswith((".jpg", ".png")) else convert_pdf_to_images(binary)
        records = []
        for i, img in enumerate(imgs):
            self.update_state(state='PROGRESS', meta={"page": i + 1})
            r = extract_logistics_fields(img, i + 1, detect_stamps(img))
            records.append(fix_missing_fields(normalize_record(r)))

        # Save Upload Info
        upload_metadata = UploadMetadata(
            file_name=original_filename, doc_type="pdf",
            file_path=f"uploads/{original_filename}", uploaded_by="system", file_hash=file_hash
        )
        db_session.add(upload_metadata)
        db_session.commit()

        # Process records
        for record in records:
            raw_data = record.get("OTHER")
            raw_text_value = json.dumps(raw_data) if isinstance(raw_data, dict) else str(raw_data or "")

            extracted_doc = ExtractedDocs(
                upload_id=upload_metadata.id,
                doc_category="BAG",
                invoice_no=record.get("Invoice_No"),
                invoice_date=record.get("Invoice_Date"),
                lr_no=record.get("LR_No"),
                lr_date=record.get("LR_Date"),
                truck_no=record.get("Vehicle_No"),
                principal_company=record.get("Principal_Company"),
                origin=record.get("Origin"),
                destination=record.get("Destination"),
                order_type=record.get("Order_Type"),
                acknowledgement_status=record.get("Acknowledgement_Status"),
                bill_to_party=record.get("Bill_To_Party"),
                ship_to_party=record.get("Ship_To_Party"),
                raw_text=raw_text_value,
                validation_status="Pending",
            )
            db_session.add(extracted_doc)
            db_session.flush()

            vehicle_no = record.get("Vehicle_No")
            invoice_no = record.get("Invoice_No") or record.get("LR_No")
            if not (vehicle_no and invoice_no):
                extracted_doc.is_linked = False
                extracted_doc.link_reason = "Missing Truck/Invoice"
                continue

            # ✅ FIX: Check existing trip before creating new one
            existing_trip = db_session.query(LinkedTrip).filter_by(
                truck_no=vehicle_no,
                order_no=invoice_no
            ).first()

            if existing_trip:
                logger.info(f"♻️ Existing trip found for {vehicle_no}-{invoice_no}")
                trip_id_to_use = existing_trip.id
            else:
                logger.info(f"🚀 Creating new trip for {vehicle_no}-{invoice_no}")
                new_trip = LinkedTrip(
                    order_no=invoice_no,
                    trip_id=f"SHIP-{vehicle_no}-{invoice_no}",
                    order_date=datetime.now(),
                    order_time=datetime.now(),
                    truck_no=vehicle_no,
                    status="Linked"
                )
                db_session.add(new_trip)
                db_session.flush()
                trip_id_to_use = new_trip.id

            db_session.add(TripDocument(trip_id=trip_id_to_use, doc_id=extracted_doc.id, doc_role="Invoice"))
            extracted_doc.is_linked = True
            extracted_doc.link_reason = f"Linked to SHIP-{vehicle_no}-{invoice_no}"

            db_session.add(WeighmentSlip(
                doc_id=extracted_doc.id,
                vehicle_no=vehicle_no,
                gross_weight=None,
                tare_weight=None,
                net_weight=None,
                slip_date=datetime.now()
            ))

        db_session.commit()
        logger.info(f"✅ All records for {original_filename} processed successfully.")
        return {"status": "SUCCESS", "records_processed": len(records)}

    except Exception as e:
        db_session.rollback()
        logger.error(f"❌ Document processing failed: {e}")
        raise DocumentProcessingError(str(e))
    finally:
        db_session.close()
