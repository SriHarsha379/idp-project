from openai import OpenAI
from db import SessionLocal
from models import ExtractedDocs
import json

client = OpenAI()
db = SessionLocal()

docs = db.query(ExtractedDocs).all()

for d in docs:
    text = f"{d.invoice_no or ''} {d.lr_no or ''} {d.truck_no or ''} {d.bill_to_party or ''} {d.ship_to_party or ''}".strip()

    emb = client.embeddings.create(
        model="text-embedding-3-small",
        input=text
    ).data[0].embedding

    d.embedding = emb  # List → JSONB automatically
    print("Updated:", d.id)

db.commit()
db.close()

print("🔥 Embeddings updated successfully!")
