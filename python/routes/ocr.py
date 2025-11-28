from fastapi import APIRouter, HTTPException, Body, Depends
from sqlalchemy.orm import Session
from db import get_db  # Assuming you have a `get_db` dependency to get DB session
from pydantic import BaseModel

from python.models import ExtractedDocs

# Router instance
router = APIRouter()


# Pydantic model for the edited fields
class EditExtractedDoc(BaseModel):
    id: int
    invoice_no: str
    lr_no: str
    truck_no: str
    quantity: str
    gross_weight: float
    net_weight: float
    consignor: str
    consignee: str
    bill_to_party: str
    ship_to_party: str
    total_amount: float
    invoice_date: str
    lr_date: str


# Endpoint to update the extracted document
@router.put("/update-ocr")
async def update_ocr_data(edit_data: EditExtractedDoc, db: Session = Depends(get_db)):
    # Find the document in the database
    doc = db.query(ExtractedDocs).filter(ExtractedDocs.id == edit_data.id).first()

    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Update the document with the new data based on UI fields
    doc.invoice_no = edit_data.invoice_no
    doc.invoice_date = edit_data.invoice_date
    doc.lr_no = edit_data.lr_no
    doc.lr_date = edit_data.lr_date
    doc.truck_no = edit_data.truck_no
    doc.quantity = edit_data.quantity
    doc.gross_weight = edit_data.gross_weight
    doc.net_weight = edit_data.net_weight
    doc.consignor = edit_data.consignor
    doc.consignee = edit_data.consignee
    doc.bill_to_party = edit_data.bill_to_party
    doc.ship_to_party = edit_data.ship_to_party
    doc.total_amount = edit_data.total_amount
    doc.validation_status = "Updated"  # Optionally update validation status

    # Commit the changes to the database
    db.commit()

    return {"message": "OCR data updated successfully", "id": doc.id}
