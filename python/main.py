# full_app.py  (replace your existing flask app file with this)
import re
import os
import json
import base64
import requests
import numpy as np
from datetime import datetime, date
from typing import Optional

import openai
from flask import Flask, request, jsonify
from flask_cors import CORS
from celery.result import AsyncResult

from sqlalchemy import or_
from db import SessionLocal
from models import ExtractedDocs, LinkedTrip, TripDocument
from tasks import process_document_task
from celery_app import app as celery_app

# ------------------------ CONFIG ------------------------
flask_app = Flask(__name__)
CORS(flask_app)

# Use environment variable for safety
openai_key = os.environ.get("OPENAI_API_KEY")

def get_db():
    return SessionLocal()

# ------------------------ UTILITIES ------------------------

def cosine_similarity(a, b):
    """
    Safe cosine similarity between two numeric sequences.
    """
    try:
        a_arr = np.array(a, dtype=float)
        b_arr = np.array(b, dtype=float)
        if a_arr.size == 0 or b_arr.size == 0:
            return 0.0
        denom = (np.linalg.norm(a_arr) * np.linalg.norm(b_arr))
        if denom == 0:
            return 0.0
        return float(np.dot(a_arr, b_arr) / denom)
    except Exception:
        return 0.0


# ------------------------ LLM PARSING ------------------------

def extract_json_from_text(text: str) -> Optional[dict]:
    if not text:
        return None
    # Find first {...} block
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    candidate = text[start:end+1]
    try:
        return json.loads(candidate)
    except Exception:
        # simple cleanup of trailing commas
        cleaned = re.sub(r",\s*}", "}", candidate)
        cleaned = re.sub(r",\s*]", "]", cleaned)
        try:
            return json.loads(cleaned)
        except Exception:
            return None


def heuristic_parse(query: str) -> dict:
    q = (query or "").strip()
    out = {"invoice_no": "", "lr_no": "", "truck_no": "", "buyer": ""}

    # LR patterns
    m = re.search(r"\b(?:lr|l\.r\.|lrno|LR No|lr_no)\s*[:#-]?\s*([A-Z0-9\/\-]+)\b", q, flags=re.I)
    if m:
        out["lr_no"] = m.group(1).strip()

    # Invoice patterns
    m = re.search(r"\b(?:invoice|inv|INV|invoice_no)\s*[:#-]?\s*([A-Z0-9\/\-]+)\b", q, flags=re.I)
    if m:
        out["invoice_no"] = m.group(1).strip()

    # Truck number approx (India)
    m = re.search(r"\b([A-Z]{2}\d{1,2}[A-Z]{1,2}\d{1,4})\b", q, flags=re.I)
    if m:
        out["truck_no"] = m.group(1).strip().upper()

    # Buyer / Bill to / Ship to
    m = re.search(r"\b(?:buyer|bill to|bill_to|ship to|ship_to|shipto)[:\-\s]*([A-Za-z0-9 &,\.\-]+)", q, flags=re.I)
    if m:
        out["buyer"] = m.group(1).strip()

    # fallback: if query looks like a plain invoice/lr/truck candidate
    if not out["invoice_no"] and re.match(r"^[A-Z0-9\-/]{3,}$", q, flags=re.I):
        # don't overwrite truck if it already matched
        if re.match(r"^[A-Z]{2}\d", q, flags=re.I):
            if not out["truck_no"]:
                out["truck_no"] = q.upper()
        else:
            out["invoice_no"] = q

    return out


def llm_parse_query(query: str) -> dict:
    """
    Use LLM to extract structured fields from a free-text query.
    Falls back to heuristic_parse on failure.
    """
    if not query:
        return {"invoice_no": "", "lr_no": "", "truck_no": "", "buyer": ""}

    prompt = f"""
You are a logistics assistant. Given a short user query, extract exactly and only the following JSON object:

{{ "invoice_no": "", "lr_no": "", "truck_no": "", "buyer": "" }}

- If a field is not present, return an empty string for it.
- Return STRICT JSON, no extra commentary or surrounding backticks.

Query: "{query}"
"""

    try:
        resp = openai.ChatCompletion.create(
            model="gpt-4o-mini",
            temperature=0,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200
        )
        text = ""
        # handle dict-like or object responses
        if isinstance(resp, dict):
            text = resp.get("choices", [{}])[0].get("message", {}).get("content", "") or resp.get("choices", [{}])[0].get("text", "")
        else:
            try:
                text = resp.choices[0].message.content
            except Exception:
                text = ""

        parsed = extract_json_from_text(text)
        if isinstance(parsed, dict):
            return {
                "invoice_no": str(parsed.get("invoice_no", "") or "").strip(),
                "lr_no": str(parsed.get("lr_no", "") or "").strip(),
                "truck_no": str(parsed.get("truck_no", "") or "").strip(),
                "buyer": str(parsed.get("buyer", "") or "").strip()
            }
    except Exception as e:
        # print/log for debugging
        print("LLM parse failed:", e)

    return heuristic_parse(query)


# ------------------------ SERIALIZERS ------------------------

def serialize_doc(d):
    return {
        "id": d.id,
        "invoice_no": d.invoice_no,
        "invoice_date": d.invoice_date.strftime("%Y-%m-%d") if d.invoice_date else None,
        "lr_no": d.lr_no,
        "lr_date": d.lr_date.strftime("%Y-%m-%d") if d.lr_date else None,
        "truck_no": d.truck_no,
        "bill_to_party": d.bill_to_party,
        "ship_to_party": d.ship_to_party,
        "origin": d.origin,
        "destination": d.destination,
    }


# ------------------------ ENDPOINTS ------------------------

# Health
@flask_app.route("/api/health")
def health():
    return {"status": "ok"}


# Process document (unchanged)
@flask_app.route("/api/process-doc", methods=["POST"])
def process_doc():
    try:
        file_b64 = None
        filename = None

        if 'document' in request.files:
            file = request.files['document']
            if file.filename == '':
                return jsonify({"detail": "Empty filename"}), 400
            file_b64 = base64.b64encode(file.read()).decode('utf-8')
            filename = file.filename
        elif request.is_json:
            data = request.get_json()
            file_b64 = data.get('file_content_b64')
            filename = data.get('original_filename')
            if not file_b64 or not filename:
                return jsonify({"detail": "Missing file_content_b64 or original_filename"}), 400
        else:
            return jsonify({"detail": "No file uploaded"}), 400

        task = process_document_task.delay(file_b64, filename)
        return jsonify({"status": "Task received", "taskId": task.id}), 202

    except Exception as e:
        return jsonify({"detail": str(e)}), 500


# Task status
@flask_app.route("/api/tasks/status/<task_id>", methods=["GET"])
def get_status_path(task_id):
    task = AsyncResult(task_id, app=celery_app)
    if task.state == "PENDING":
        return jsonify({"status": "PENDING"}), 200
    if task.state == "PROGRESS":
        return jsonify({"status": "PROCESSING", "progress": task.info.get("progress")}), 200
    if task.state == "FAILURE":
        return jsonify({"status": "FAILURE", "error": str(task.info)}), 200
    return jsonify({"status": "SUCCESS"}), 200


# Get all docs
@flask_app.route("/api/get-all-docs", methods=["GET"])
def get_all_docs():
    db = get_db()
    try:
        extracted = db.query(ExtractedDocs).all()
        trips = db.query(LinkedTrip).all()
        return jsonify({
            "records": [{
                "id": d.id,
                "page_number": 1,
                "Extracted_From": d.doc_category,
                "Principal_Company": d.principal_company,
                "lr_no": d.lr_no,
                "lr_date": d.lr_date.strftime("%Y-%m-%d") if d.lr_date else None,
                "invoice_no": d.invoice_no,
                "invoice_date": d.invoice_date.strftime("%Y-%m-%d") if d.invoice_date else None,
                "truck_no": d.truck_no,
                "bill_to_party": d.bill_to_party,
                "ship_to_party": d.ship_to_party,
                "origin": d.origin,
                "destination": d.destination,
                "order_type": d.order_type,
                "acknowledgement_status": d.acknowledgement_status
            } for d in extracted],
            "shipments": [{
                "id": t.id,
                "trip_id": t.trip_id,
                "LR_No": t.order_no,
                "LR_Date": t.order_date.strftime("%Y-%m-%d") if t.order_date else None,
                "Invoice_No": t.order_no,
                "Invoice_Date": t.order_date.strftime("%Y-%m-%d") if t.order_date else None,
                "Vehicle_No": t.truck_no,
            } for t in trips]
        })
    finally:
        db.close()


# Update extracted doc
@flask_app.route("/api/extracted-doc/<int:doc_id>", methods=["PUT"])
def update_extracted_doc(doc_id):
    db = get_db()
    try:
        doc = db.query(ExtractedDocs).filter(ExtractedDocs.id == doc_id).first()
        if not doc:
            return jsonify({"detail": "Doc not found"}), 404

        updates = request.json or {}
        mapping = {
            "lr_no": "lr_no", "lr_date": "lr_date",
            "invoice_no": "invoice_no", "invoice_date": "invoice_date",
            "truck_no": "truck_no",
            "bill_to_party": "bill_to_party", "ship_to_party": "ship_to_party",
            "Principal_Company": "principal_company",
            "origin": "origin", "destination": "destination",
            "order_type": "order_type", "acknowledgement_status": "acknowledgement_status"
        }

        for front, db_key in mapping.items():
            if front in updates:
                value = updates[front] or None
                if db_key.endswith("date") and value:
                    value = datetime.strptime(value, "%Y-%m-%d").date()
                setattr(doc, db_key, value)

        doc.validation_status = "Manual_Correction"
        doc.last_validated_at = datetime.now()
        doc.last_validated_by = "Frontend_User"

        db.commit()
        return jsonify({"status": "SUCCESS"}), 200
    except Exception as e:
        db.rollback()
        return jsonify({"detail": str(e)}), 500
    finally:
        db.close()


# Date tolerance helper
def dates_close(d1, d2, max_days=5):
    if not d1 or not d2:
        return False
    d1 = d1.date() if isinstance(d1, datetime) else d1
    d2 = d2.date() if isinstance(d2, datetime) else d2
    return abs((d1 - d2).days) <= max_days


# Re-link logic (unchanged)
@flask_app.route("/api/relink/<int:doc_id>", methods=["POST", "OPTIONS"])
def relink_document(doc_id):
    db = get_db()
    try:
        doc = db.query(ExtractedDocs).filter(ExtractedDocs.id == doc_id).first()
        if not doc:
            return jsonify({"detail": "Doc not found"}), 404

        matches = db.query(ExtractedDocs).filter(
            ExtractedDocs.invoice_no == doc.invoice_no,
            ExtractedDocs.lr_no == doc.lr_no,
            ExtractedDocs.truck_no == doc.truck_no
        ).all()

        good_docs = []
        for d in matches:
            inv_ok = dates_close(doc.invoice_date, d.invoice_date, 5)
            lr_ok = dates_close(doc.lr_date, d.lr_date, 5)
            if inv_ok or lr_ok:
                good_docs.append(d)

        if len(good_docs) < 2:
            for d in matches:
                d.is_linked = False
                d.link_reason = "Needs manual review"
            db.commit()
            return jsonify({"status": "NO_LINK"}), 200

        trip_key = f"SHIP-{doc.truck_no}-{doc.invoice_no}"
        all_doc_ids = [d.id for d in good_docs]

        existing_trip_docs = db.query(TripDocument).filter(TripDocument.doc_id.in_(all_doc_ids)).all()
        existing_trip_ids = list(set([td.trip_id for td in existing_trip_docs]))

        db.query(TripDocument).filter(TripDocument.doc_id.in_(all_doc_ids)).delete(synchronize_session=False)
        if existing_trip_ids:
            db.query(LinkedTrip).filter(LinkedTrip.id.in_(existing_trip_ids)).delete(synchronize_session=False)
        db.commit()

        new_trip = LinkedTrip(
            trip_id=trip_key,
            order_no=doc.lr_no,
            order_date=doc.lr_date,
            truck_no=doc.truck_no
        )
        db.add(new_trip)
        db.commit()

        for d in good_docs:
            d.is_linked = True
            d.link_reason = f"Linked to {trip_key}"
            db.add(TripDocument(trip_id=new_trip.id, doc_id=d.id))

        db.commit()
        return jsonify({"status": "SUCCESS", "trip_id": trip_key, "linked_docs": len(good_docs)}), 200

    except Exception as e:
        db.rollback()
        print("❌ Re-link error:", e)
        return jsonify({"detail": str(e)}), 500
    finally:
        db.close()


# LLM understand endpoint (exposes llm_parse_query)
@flask_app.route("/api/llm/understand", methods=["POST"])
def llm_understand():
    try:
        data = request.json or {}
        query = data.get("query", "") if isinstance(data, dict) else ""
        parsed = llm_parse_query(query)
        parsed = {
            "invoice_no": parsed.get("invoice_no", "") if isinstance(parsed, dict) else "",
            "lr_no": parsed.get("lr_no", "") if isinstance(parsed, dict) else "",
            "truck_no": parsed.get("truck_no", "") if isinstance(parsed, dict) else "",
            "buyer": parsed.get("buyer", "") if isinstance(parsed, dict) else ""
        }
        return jsonify(parsed)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# Basic keyword search endpoint (unchanged)
@flask_app.route("/api/search", methods=["GET"])
def search_docs():
    db = get_db()
    try:
        q = request.args.get("invoice_no") or request.args.get("lr_no") or request.args.get("truck_no") or request.args.get("buyer")
        if not q:
            return jsonify({"count": 0, "results": []})
        q = q.strip()
        query = db.query(ExtractedDocs).filter(
            or_(
                ExtractedDocs.invoice_no.ilike(f"%{q}%"),
                ExtractedDocs.lr_no.ilike(f"%{q}%"),
                ExtractedDocs.truck_no.ilike(f"%{q}%"),
                ExtractedDocs.bill_to_party.ilike(f"%{q}%"),
                ExtractedDocs.ship_to_party.ilike(f"%{q}%")
            )
        )
        results = query.all()
        final = []
        for r in results:
            final.append({
                "invoice_no": r.invoice_no,
                "invoice_date": r.invoice_date.strftime("%Y-%m-%d") if r.invoice_date else None,
                "lr_no": r.lr_no,
                "lr_date": r.lr_date.strftime("%Y-%m-%d") if r.lr_date else None,
                "truck_no": r.truck_no,
                "bill_to_party": r.bill_to_party,
                "ship_to_party": r.ship_to_party,
                "origin": r.origin,
                "destination": r.destination
            })
        return jsonify({"count": len(final), "results": final})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()


# Download placeholder
@flask_app.route("/api/download/<int:doc_id>", methods=["GET"])
def download_doc(doc_id):
    return jsonify({"detail": "PDFs are not stored on server yet."}), 501


# ------------------------ EMBEDDING GENERATION ------------------------
# Rich embedding builder (recommended)
def build_rich_doc_text(d: ExtractedDocs) -> str:
    pieces = [
        f"Invoice: {d.invoice_no or ''}",
        f"LR: {d.lr_no or ''}",
        f"Truck: {d.truck_no or ''}",
        f"BillTo: {d.bill_to_party or ''}",
        f"ShipTo: {d.ship_to_party or ''}",
        f"Company: {d.principal_company or ''}",
        f"Origin: {d.origin or ''}",
        f"Destination: {d.destination or ''}",
        f"Acknowledgement: {d.acknowledgement_status or ''}",
        f"OrderType: {d.order_type or ''}"
    ]
    # join with newlines for context
    return "\n".join(pieces)


@flask_app.route("/admin/generate-embeddings", methods=["POST"])
def generate_embeddings():
    """
    Admin endpoint to generate/update embeddings for all documents.
    POST only. No auth here — add auth in production.
    """
    db = get_db()
    try:
        client = openai  # using openai.Embedding.create
        docs = db.query(ExtractedDocs).all()
        updated = 0
        for d in docs:
            doc_text = build_rich_doc_text(d)
            if not doc_text.strip():
                continue
            try:
                resp = client.Embedding.create(model="text-embedding-3-small", input=doc_text)
                emb = resp["data"][0]["embedding"]
                d.embedding = emb  # JSONB accepts Python list
                updated += 1
            except Exception as e:
                print(f"Embedding failed for doc {d.id}: {e}")
        db.commit()
        return jsonify({"status": "ok", "updated": updated}), 200
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()


# ------------------------ SEMANTIC SEARCH (JSONB) ------------------------
@flask_app.route("/api/semantic-search", methods=["GET"])
def semantic_search():
    db = get_db()
    query_text = (request.args.get("q") or "").strip()
    force_mode = request.args.get("mode", "").lower()  # optional: ?mode=semantic to force vector
    rerank = request.args.get("rerank", "true").lower() != "false"

    if not query_text:
        return jsonify({"count": 0, "results": []})

    try:
        # 1) Let LLM interpret
        try:
            llm_parse = requests.post("http://127.0.0.1:5000/api/llm/understand", json={"query": query_text}, timeout=4).json()
        except Exception:
            llm_parse = {}

        extracted_key = (llm_parse.get("invoice_no") or llm_parse.get("lr_no") or llm_parse.get("truck_no") or llm_parse.get("buyer") or "")

        # If LLM found a clear key and user didn't force semantic mode -> keyword fast path
        if extracted_key and force_mode != "semantic":
            like = f"%{extracted_key}%"
            matches = db.query(ExtractedDocs).filter(
                or_(
                    ExtractedDocs.invoice_no.ilike(like),
                    ExtractedDocs.lr_no.ilike(like),
                    ExtractedDocs.truck_no.ilike(like),
                    ExtractedDocs.bill_to_party.ilike(like),
                    ExtractedDocs.ship_to_party.ilike(like),
                )
            ).limit(50).all()

            results = [serialize_doc(m) for m in matches]
            return jsonify({"mode": "keyword", "llm_extract": llm_parse, "count": len(results), "results": results})

        # Slow path: semantic search via JSONB embeddings + python cosine
        emb_resp = openai.Embedding.create(model="text-embedding-3-small", input=query_text)
        query_emb = emb_resp["data"][0]["embedding"]

        # fetch documents that have embedding
        all_docs = db.query(ExtractedDocs).filter(ExtractedDocs.embedding.isnot(None)).all()
        scored = []
        for d in all_docs:
            try:
                score = cosine_similarity(query_emb, d.embedding)
                scored.append((score, d))
            except Exception:
                continue

        # sort and take top N
        scored.sort(key=lambda x: x[0], reverse=True)
        top = scored[:15]
        top_docs = [serialize_doc(doc) for score, doc in top]

        # optional rerank using LLM for final ordering (keep it lightweight)
        if rerank and top_docs:
            try:
                # reuse existing rerank function pattern but simplified input form
                prompt_items = "\n".join([
                    f"{i+1}. Invoice {d['invoice_no'] or '-'} / LR {d['lr_no'] or '-'} / Truck {d['truck_no'] or '-'} / BillTo {d['bill_to_party'] or '-'} / ShipTo {d['ship_to_party'] or '-'}"
                    for i, d in enumerate(top_docs)
                ])
                prompt = f"""
You are a ranking AI. Rank the following logistics shipment documents for relevance to user query: "{query_text}".
Return ONLY JSON array of objects with fields index (1-based) and score (0.0-1.0).

Items:
{prompt_items}
"""
                resp = openai.ChatCompletion.create(model="gpt-4o-mini", temperature=0, messages=[{"role":"user","content":prompt}], max_tokens=300)
                txt = resp["choices"][0]["message"]["content"]
                arr = json.loads(txt)
                # build map index->score and reorder
                score_map = {item["index"]-1: item["score"] for item in arr if isinstance(item.get("index"), int)}
                ranked = sorted([(score_map.get(i, top[i][0]), top[i][1]) for i in range(len(top))], key=lambda x: x[0], reverse=True)
                top_docs = [serialize_doc(doc) for score, doc in ranked]
                return jsonify({"mode": "jsonb_vector+rerank", "count": len(top_docs), "results": top_docs, "llm_extract": llm_parse})
            except Exception as e:
                print("Rerank failed:", e)

        return jsonify({"mode": "jsonb_vector", "count": len(top_docs), "results": top_docs, "llm_extract": llm_parse})

    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()


# ------------------------ OPTIONAL: SAFE ADMIN ENDPOINTS ------------------------
@flask_app.route("/admin/health/full", methods=["GET"])
def admin_health():
    """Simple DB quick-check"""
    db = get_db()
    try:
        cnt = db.query(ExtractedDocs).count()
        return jsonify({"ok": True, "docs": cnt})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500
    finally:
        db.close()

# ------------------------ GET DOCS BY COMPANY ------------------------
@flask_app.route("/api/get-docs", methods=["GET"])
def get_docs_by_company():
    company = request.args.get("company", "").strip()

    if not company:
        return jsonify({"records": [], "message": "Company name missing"}), 400

    db = get_db()
    try:
        docs = db.query(ExtractedDocs).filter(
            or_(
                ExtractedDocs.bill_to_party.ilike(f"%{company}%"),
                ExtractedDocs.ship_to_party.ilike(f"%{company}%"),
                ExtractedDocs.principal_company.ilike(f"%{company}%")
            )
        ).all()

        output = []
        for d in docs:
            output.append({
                "invoice_no": d.invoice_no,
                "truck_no": d.truck_no,
                "timestamp": d.invoice_date.strftime("%Y-%m-%d") if d.invoice_date else None,
                "ship_to_party": d.ship_to_party,
            })

        return jsonify({"records": output}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    finally:
        db.close()

# ---------------------------------------
#  AI Chat Endpoint (Required for Frontend)
# ---------------------------------------
@flask_app.post("/api/chat")
def chat_api():
    data = request.get_json(silent=True) or {}
    query = str(data.get("query", "")).strip()
    company = str(data.get("company", "")).strip().lower()

    reply = generate_reply(query, company)
    return jsonify({"reply": reply})



def generate_reply(query: str, company: str) -> str:
    q = query.lower().strip()
    db = get_db()

    try:
        # 🔍 Detect LR number
        m = re.search(r"\b(?:lr|lr no|lr number)?\s*([0-9]{2,})\b", q)
        if m:
            lr_no = m.group(1)

            doc = db.query(ExtractedDocs).filter(
                ExtractedDocs.lr_no == lr_no,
                or_(
                    ExtractedDocs.bill_to_party.ilike(f"%{company}%"),
                    ExtractedDocs.ship_to_party.ilike(f"%{company}%"),
                    ExtractedDocs.principal_company.ilike(f"%{company}%")
                )
            ).first()

            if doc:
                return (
                    f"📄 **LR Details for {lr_no}**\n"
                    f"- **Invoice:** {doc.invoice_no or 'N/A'}\n"
                    f"- **LR Date:** {doc.lr_date or 'N/A'}\n"
                    f"- **Truck:** {doc.truck_no or 'N/A'}\n"
                    f"- **Bill To:** {doc.bill_to_party or 'N/A'}\n"
                    f"- **Ship To:** {doc.ship_to_party or 'N/A'}\n"
                    f"- **Origin:** {doc.origin or 'N/A'} → **Destination:** {doc.destination or 'N/A'}"
                )

            return f"❌ No LR {lr_no} found for your company."

        # 🛻 Detect truck numbers (restricted)
        m = re.search(r"\b([A-Z]{2}\d{1,2}[A-Z]{1,2}\d{3,4})\b", q)
        if m:
            truck_no = m.group(1).upper()

            doc = db.query(ExtractedDocs).filter(
                ExtractedDocs.truck_no.ilike(f"%{truck_no}%"),
                or_(
                    ExtractedDocs.bill_to_party.ilike(f"%{company}%"),
                    ExtractedDocs.ship_to_party.ilike(f"%{company}%"),
                    ExtractedDocs.principal_company.ilike(f"%{company}%")
                )
            ).first()

            if doc:
                return (
                    f"🚛 **Truck {truck_no} Shipment**\n"
                    f"- Invoice: {doc.invoice_no}\n"
                    f"- LR No: {doc.lr_no}\n"
                    f"- Bill To: {doc.bill_to_party}\n"
                    f"- Ship To: {doc.ship_to_party}"
                )

            return f"❌ No shipments found for truck {truck_no} in your company."

        # Small talk
        if "how are" in q:
            return "I'm doing great! How can I assist you with your shipments today? 😊"

        if "hello" in q or "hi" in q:
            return "Hello! What shipment would you like to check today?"

        return f"I received '{query}'. Try asking:\n- 'Show LR 921'\n- 'Truck MH12AB1234'\n- 'Invoice 9982'"

    finally:
        db.close()


# ------------------------ RUN ------------------------
if __name__ == "__main__":
    flask_app.run(debug=True, port=5000)
