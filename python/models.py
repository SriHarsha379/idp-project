# --- File: models.py ---
from sqlalchemy import (
    Column, Integer, String, Numeric, DateTime, ForeignKey, Text, Boolean, func, Date, Float, TIMESTAMP, text
)
from sqlalchemy.orm import relationship
from db import Base # Assuming 'db' module contains the declarative base
from datetime import datetime
from sqlalchemy.dialects.postgresql import JSONB

class UploadMetadata(Base):
    __tablename__ = "upload_metadata"

    id = Column(Integer, primary_key=True, index=True)
    file_name = Column(String(255), nullable=False)
    doc_type = Column(String(50), nullable=False)  # e.g. pdf, jpg
    file_path = Column(String, nullable=False)
    uploaded_by = Column(String, default="system")
    file_hash = Column(String(64), unique=True, nullable=True)
    upload_status = Column(String(30), default="Pending")
    retry_count = Column(Integer, default=0)
    max_retries = Column(Integer, default=3)

    # New fields added for PreProcessingAgent
    detected_dealer = Column(String(100), nullable=True)
    detected_category = Column(String(50), nullable=True)

    created_at = Column(DateTime, server_default=func.now())

    # Relationships
    # 🔑 CRITICAL FIX: Changed back_populates="upload" to "upload_metadata"
    # to match the property name in ExtractedDocs.
    extracted_docs = relationship("ExtractedDocs", back_populates="upload_metadata")


class ExtractedDocs(Base):
    __tablename__ = 'extracted_docs'

    id = Column(Integer, primary_key=True, index=True)
    upload_id = Column(Integer, ForeignKey('upload_metadata.id'))

    doc_category = Column(String(50))
    invoice_no = Column(String(255))
    invoice_date = Column(DateTime)
    lr_no = Column(String(255))
    lr_date = Column(DateTime)
    truck_no = Column(String(50))

    principal_company = Column(String(255))
    origin = Column(String(255))
    destination = Column(String(255))
    order_type = Column(String(50))
    acknowledgement_status = Column(String(50))

    bill_to_party = Column(String(255))
    ship_to_party = Column(String(255))

    raw_text = Column(String)

    validation_status = Column(String(50), default="Pending")
    is_linked = Column(Boolean, default=False)
    link_reason = Column(String(255))
    last_validated_at = Column(DateTime)
    last_validated_by = Column(String(50))

    # 🚀 ADD THIS
    embedding = Column(JSONB)


    upload_metadata = relationship("UploadMetadata", back_populates="extracted_docs")
    weighment_slips = relationship("WeighmentSlip", back_populates="extracted_doc")
    trip_links = relationship("TripDocument", back_populates="doc")



class WeighmentSlip(Base):
    __tablename__ = "weighment_slips"

    id = Column(Integer, primary_key=True, index=True)
    doc_id = Column(Integer, ForeignKey("extracted_docs.id", ondelete="CASCADE"), nullable=False)

    vehicle_no = Column(String(50))
    gross_weight = Column(Numeric(10, 2))
    tare_weight = Column(Numeric(10, 2))
    net_weight = Column(Numeric(10, 2))
    slip_date = Column(DateTime)

    extracted_doc = relationship("ExtractedDocs", back_populates="weighment_slips")


class LinkedTrip(Base):
    __tablename__ = "linked_trips"

    id = Column(Integer, primary_key=True, index=True)
    trip_id = Column(String(50), unique=True, index=True)  # e.g. "20250930-1234-1"

    # Compulsory linking fields
    order_no = Column(String(100), nullable=False)
    order_date = Column(DateTime, nullable=False)
    order_time = Column(DateTime, nullable=False)
    truck_no = Column(String(50), nullable=False)

    status = Column(String(30), default="Linked")  # Linked, Pending, Conflict, Not Linked
    created_at = Column(DateTime, server_default=func.now())

    documents = relationship("TripDocument", back_populates="trip", cascade="all, delete-orphan")


class TripDocument(Base):
    __tablename__ = "trip_documents"

    id = Column(Integer, primary_key=True, index=True)
    trip_id = Column(Integer, ForeignKey("linked_trips.id", ondelete="CASCADE"))
    doc_id = Column(Integer, ForeignKey("extracted_docs.id", ondelete="CASCADE"))

    doc_role = Column(String(30))  # "LR", "Invoice", "WeighmentSlip", "Ack"

    trip = relationship("LinkedTrip", back_populates="documents")
    # 🔑 IMPORTANT: Renamed back_populates from "trip_links" to "doc"
    # to match the property name defined in ExtractedDocs (trip_links).
    doc = relationship("ExtractedDocs", back_populates="trip_links")
    # NOTE: The relationship was corrected in ExtractedDocs to trip_links,
    # so TripDocument should use that name or ExtractedDocs should use 'doc'.
    # I've updated ExtractedDocs to use "trip_links" to avoid naming conflict with the column "doc_id".
    # I will change the relationship name in ExtractedDocs to "trip_links" to clarify.


class ExtractedPage(Base):
    __tablename__ = "extracted_pages"

    id = Column(Integer, primary_key=True, index=True)
    upload_id = Column(Integer, ForeignKey("upload_metadata.id"), nullable=False)
    page_no = Column(Integer, nullable=False)

    dealer_name = Column(String, nullable=True)
    bill_no = Column(String, nullable=True)
    duration_from = Column(Date, nullable=True)
    duration_to = Column(Date, nullable=True)
    invoice_no = Column(String, nullable=True)
    lr_no = Column(String, nullable=True)
    lr_date = Column(Date, nullable=True)
    truck_no = Column(String, nullable=True)
    bill_to_party = Column(String, nullable=True)
    ship_to_party = Column(String, nullable=True)
    quantity = Column(String, nullable=True)
    extraction_confidence = Column(Float, nullable=True, default=0.0)
    raw_text = Column(Text, nullable=True)
    is_flagged = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.now)

    # New field to store actual extracted PDF path (or S3 key)
    pdf_path = Column(String, nullable=True)

class DealerSummary(Base):
    __tablename__ = "dealer_summary"

    id = Column(Integer, primary_key=True, index=True)
    dealer_name = Column(String, nullable=False)
    bill_no = Column(String, nullable=True)
    duration_from = Column(Date, nullable=True)
    duration_to = Column(Date, nullable=True)
    total_lr_count = Column(Integer, default=0)
    total_truck_count = Column(Integer, default=0)
    total_net_weight = Column(Float, default=0.0)
    upload_id = Column(Integer, ForeignKey("upload_metadata.id"), nullable=False)
    status = Column(String, default="PENDING")
    created_at = Column(DateTime, default=datetime.now)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(120), unique=True, nullable=False)
    password = Column(String(255), nullable=True)
    user_type = Column(String(10), nullable=False, default="USER")
    company_name = Column(String(150), nullable=True)
    is_verified = Column(Boolean, default=False)
    otp = Column(String(6), nullable=True)
    otp_expires_at = Column(TIMESTAMP(timezone=False), nullable=True)
    created_at = Column(TIMESTAMP(timezone=False), server_default=text("now()"))
    updated_at = Column(TIMESTAMP(timezone=False), server_default=text("now()"), onupdate=text("now()"))