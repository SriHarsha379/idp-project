# 🚛 B2B Cement Logistics – OCR & Shipment Linking System

A smart document automation platform that extracts data from **invoice, LR, and weighment slips**, validates logistics fields, and **links multiple documents into a single shipment trip** using intelligent rules.

---

## ✅ Core Capabilities

- 📄 **OCR extraction** from PDF & Images  
- 🔗 **Auto shipment linking** based on Invoice, LR, Truck, and Date proximity  
- ✏️ **Manual correction + Re-linking support**  
- 🚚 **Trip creation** like: `SHIP-AP28TC1234-INV009876`  
- ⚡ **Async processing** using Celery + Redis  
- 📊 **Dashboard for documents, extraction, and linked shipments**  
- 🧠 **Rule-based validation** (Truck, Invoice, LR, Ship-to, Date ±5 days)

---

## 🧾 Document Rules

| Shipment Type | Required Docs |
|-------------|--------------|
| **Bag**     | Invoice + LR |
| **Bulk**    | Invoice + LR + Weighment Slip |

---

## 🏗️ Tech Stack

| Layer | Stack |
|---|---|
| Frontend | Next.js (React) |
| Backend | Flask (Python) |
| DB | PostgreSQL |
| Queue | Celery + Redis (Docker) |
| OCR | AI Vision + Custom Parsers |

---

## 🔍 Matching & Linking Rules

Trips are linked when:

- Same **Truck No**
- Same **Invoice No**
- Same **LR No**
- Same **Ship-to Party**
- **Invoice/LR Date difference ≤ 5 days**

---

## 🗄️ DB Structure (Main Tables)

| Table | Purpose |
|---|---|
| `users` | Login auth |
| `upload_metadata` | Uploaded files |
| `extracted_docs` | OCR extracted fields |
| `linked_trips` | Created trip records |
| `trip_documents` | Docs mapped to trip |

---

## 🚀 Local Setup (One-Click Start)

### ✅ Prerequisites

Install:
- **Docker Desktop**
- **Python 3.9+**
- **Node.js 16+**
- **PostgreSQL**
- **Git**

---

### ▶️ Start all services using `start.bat`

Just run:

```bash
start.bat
