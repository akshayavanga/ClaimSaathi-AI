from dotenv import load_dotenv
from google import genai
from google.genai import types
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from datetime import datetime, date
from pathlib import Path
from typing import List, Optional, Dict, Any
from contextlib import contextmanager
import sqlite3
import calendar
import uuid
import os
import json
import re

# Gemini configuration
load_dotenv(Path(__file__).resolve().parent / ".env")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise ValueError("Gemini API Key not found")
client = genai.Client(api_key=GEMINI_API_KEY)

app = FastAPI(
    title="ClaimSaathi AI API",
    version="3.2.0",
    description="Intelligent Consumer Protection & Warranty Management API"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# DATABASE & FILE STORAGE
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "claimsathi.db"
UPLOAD_DIR = BASE_DIR / "uploads" / "invoices"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Mount static file directory to serve uploaded invoice documents
app.mount("/uploads", StaticFiles(directory=str(BASE_DIR / "uploads")), name="uploads")


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
    finally:
        conn.close()


def create_tables():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                brand TEXT,
                purchase_date TEXT NOT NULL,
                warranty_months INTEGER,
                purchase_price REAL,
                warranty_end TEXT,
                retailer TEXT DEFAULT '',
                invoice_no TEXT DEFAULT '',
                created_at TEXT
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                stored_filename TEXT NOT NULL,
                file_path TEXT NOT NULL,
                product_id INTEGER,
                uploaded_at TEXT,
                FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE SET NULL
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS claims (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER,
                issue TEXT NOT NULL,
                description TEXT,
                status TEXT DEFAULT 'Submitted',
                evidence_file TEXT DEFAULT '',
                created_at TEXT,
                FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
            )
        """)

        # Safe migrations for existing databases
        doc_cols = [col[1] for col in conn.execute("PRAGMA table_info(documents)").fetchall()]
        if "product_id" not in doc_cols:
            conn.execute("ALTER TABLE documents ADD COLUMN product_id INTEGER REFERENCES products(id) ON DELETE SET NULL")

        prod_cols = [col[1] for col in conn.execute("PRAGMA table_info(products)").fetchall()]
        if "retailer" not in prod_cols:
            conn.execute("ALTER TABLE products ADD COLUMN retailer TEXT DEFAULT ''")
        if "invoice_no" not in prod_cols:
            conn.execute("ALTER TABLE products ADD COLUMN invoice_no TEXT DEFAULT ''")

        claim_cols = [col[1] for col in conn.execute("PRAGMA table_info(claims)").fetchall()]
        if "evidence_file" not in claim_cols:
            conn.execute("ALTER TABLE claims ADD COLUMN evidence_file TEXT DEFAULT ''")

        conn.commit()


create_tables()


# MODELS
class Product(BaseModel):
    name: str
    brand: str = ""
    purchase_date: str
    warranty_months: int = 12
    purchase_price: float = 0
    retailer: str = ""
    invoice_no: str = ""


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    brand: Optional[str] = None
    purchase_date: Optional[str] = None
    warranty_months: Optional[int] = None
    purchase_price: Optional[float] = None
    retailer: Optional[str] = None
    invoice_no: Optional[str] = None


class ChatMessage(BaseModel):
    role: str
    text: str


class ChatRequest(BaseModel):
    message: str
    history: Optional[List[ChatMessage]] = []


class Claim(BaseModel):
    product_id: int
    issue: str
    description: str = ""
    evidence_file: str = ""


class ClaimStatusUpdate(BaseModel):
    status: str


class DocumentLinkRequest(BaseModel):
    product_id: Optional[int] = None


class ClaimLetterRequest(BaseModel):
    product_id: int
    issue: str
    description: str = ""
    desired_resolution: str = "Repair / Replacement under Warranty"
    consumer_name: str = "Consumer"


# WARRANTY DATE CALCULATION
def calculate_warranty_end(purchase_date: str, months: int):
    try:
        purchase = datetime.strptime(purchase_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid purchase date. Use YYYY-MM-DD."
        )

    if months < 1 or months > 120:
        raise HTTPException(
            status_code=400,
            detail="Warranty must be between 1 and 120 months."
        )

    total_months = purchase.month - 1 + months
    year = purchase.year + total_months // 12
    month = total_months % 12 + 1
    day = min(
        purchase.day,
        calendar.monthrange(year, month)[1]
    )

    return datetime(year, month, day).strftime("%Y-%m-%d")


# HOME
@app.get("/")
def home():
    return {
        "message": "ClaimSaathi AI Backend is Running!",
        "status": "success",
        "version": "3.2.0"
    }


# ADD PRODUCT
@app.post("/products")
def add_product(product: Product):
    if not product.name.strip():
        raise HTTPException(
            status_code=400,
            detail="Product name is required."
        )

    warranty_end = calculate_warranty_end(
        product.purchase_date,
        product.warranty_months
    )

    if product.purchase_price < 0:
        raise HTTPException(
            status_code=400,
            detail="Purchase price cannot be negative."
        )

    with get_db() as conn:
        cursor = conn.execute("""
            INSERT INTO products (
                name,
                brand,
                purchase_date,
                warranty_months,
                purchase_price,
                warranty_end,
                retailer,
                invoice_no,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            product.name.strip(),
            product.brand.strip(),
            product.purchase_date,
            product.warranty_months,
            product.purchase_price,
            warranty_end,
            product.retailer.strip(),
            product.invoice_no.strip(),
            datetime.now().isoformat()
        ))

        conn.commit()
        product_id = cursor.lastrowid

    return {
        "message": "Product saved successfully",
        "product_id": product_id,
        "warranty_end": warranty_end
    }


# UPDATE PRODUCT
@app.patch("/products/{product_id}")
def update_product(product_id: int, update: ProductUpdate):
    with get_db() as conn:
        existing = conn.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Product not found.")

        name = update.name.strip() if update.name is not None else existing["name"]
        brand = update.brand.strip() if update.brand is not None else existing["brand"]
        purchase_date = update.purchase_date if update.purchase_date is not None else existing["purchase_date"]
        warranty_months = update.warranty_months if update.warranty_months is not None else existing["warranty_months"]
        purchase_price = update.purchase_price if update.purchase_price is not None else existing["purchase_price"]
        retailer = update.retailer.strip() if update.retailer is not None else existing["retailer"]
        invoice_no = update.invoice_no.strip() if update.invoice_no is not None else existing["invoice_no"]

        warranty_end = calculate_warranty_end(purchase_date, warranty_months)

        conn.execute("""
            UPDATE products
            SET name = ?, brand = ?, purchase_date = ?, warranty_months = ?,
                purchase_price = ?, warranty_end = ?, retailer = ?, invoice_no = ?
            WHERE id = ?
        """, (name, brand, purchase_date, warranty_months, purchase_price, warranty_end, retailer, invoice_no, product_id))
        conn.commit()

    return {
        "message": "Product updated successfully",
        "product_id": product_id,
        "warranty_end": warranty_end
    }


# GET ALL PRODUCTS
@app.get("/products")
def get_products():
    with get_db() as conn:
        rows = conn.execute("""
            SELECT * FROM products
            ORDER BY id DESC
        """).fetchall()

    return [dict(row) for row in rows]


# DELETE PRODUCT
@app.delete("/products/{product_id}")
def delete_product(product_id: int):
    with get_db() as conn:
        cursor = conn.execute(
            "DELETE FROM products WHERE id = ?",
            (product_id,)
        )
        conn.commit()
        deleted = cursor.rowcount

    if deleted == 0:
        raise HTTPException(
            status_code=404,
            detail="Product not found."
        )

    return {
        "message": "Product deleted successfully"
    }


# UPLOAD INVOICE
@app.post("/upload-invoice")
async def upload_invoice(
    file: UploadFile = File(...),
    product_id: Optional[int] = Form(None)
):
    allowed = {
        ".pdf": "application/pdf",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png"
    }

    extension = Path(file.filename or "").suffix.lower()
    if extension not in allowed:
        raise HTTPException(
            status_code=400,
            detail="Upload a PDF, JPG or PNG invoice."
        )

    content = await file.read()
    if not content:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is empty."
        )

    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail="Maximum file size is 10 MB."
        )

    stored_filename = f"{uuid.uuid4().hex}{extension}"
    file_path = UPLOAD_DIR / stored_filename

    try:
        file_path.write_bytes(content)

        with get_db() as conn:
            cursor = conn.execute("""
                INSERT INTO documents (
                    filename,
                    stored_filename,
                    file_path,
                    product_id,
                    uploaded_at
                )
                VALUES (?, ?, ?, ?, ?)
            """, (
                Path(file.filename).name,
                stored_filename,
                str(file_path),
                product_id,
                datetime.now().isoformat()
            ))

            conn.commit()
            doc_id = cursor.lastrowid

    except Exception as e:
        file_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=500,
            detail=f"Unable to save invoice: {str(e)}"
        )

    return {
        "message": "Invoice uploaded successfully",
        "document_id": doc_id,
        "filename": Path(file.filename).name,
        "file_url": f"/uploads/invoices/{stored_filename}",
        "product_id": product_id,
        "size": len(content)
    }


# GET UPLOADED DOCUMENTS
@app.get("/documents")
def get_documents():
    with get_db() as conn:
        rows = conn.execute("""
            SELECT
                documents.id,
                documents.filename,
                documents.stored_filename,
                documents.uploaded_at,
                documents.product_id,
                products.name AS product_name
            FROM documents
            LEFT JOIN products ON documents.product_id = products.id
            ORDER BY documents.id DESC
        """).fetchall()

    return [
        {
            "id": row["id"],
            "filename": row["filename"],
            "stored_filename": row["stored_filename"],
            "file_url": f"/uploads/invoices/{row['stored_filename']}",
            "uploaded_at": row["uploaded_at"],
            "product_id": row["product_id"],
            "product_name": row["product_name"] or "Unlinked"
        }
        for row in rows
    ]


# LINK DOCUMENT TO PRODUCT
@app.patch("/documents/{document_id}/link")
def link_document(
    document_id: int,
    product_id: Optional[int] = Query(None),
    payload: Optional[DocumentLinkRequest] = None
):
    resolved_product_id = payload.product_id if (payload and payload.product_id is not None) else product_id

    with get_db() as conn:
        if resolved_product_id is not None:
            prod = conn.execute("SELECT id FROM products WHERE id = ?", (resolved_product_id,)).fetchone()
            if not prod:
                raise HTTPException(status_code=404, detail="Target product not found.")

        cursor = conn.execute("""
            UPDATE documents
            SET product_id = ?
            WHERE id = ?
        """, (resolved_product_id, document_id))

        conn.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Document not found.")

    return {
        "message": "Document linked successfully",
        "document_id": document_id,
        "product_id": resolved_product_id
    }


# DELETE DOCUMENT
@app.delete("/documents/{document_id}")
def delete_document(document_id: int):
    with get_db() as conn:
        doc = conn.execute("SELECT file_path FROM documents WHERE id = ?", (document_id,)).fetchone()
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found.")

        try:
            Path(doc["file_path"]).unlink(missing_ok=True)
        except Exception:
            pass

        conn.execute("DELETE FROM documents WHERE id = ?", (document_id,))
        conn.commit()

    return {"message": "Document deleted successfully"}


# CREATE CLAIM
@app.post("/claims")
def create_claim(claim: Claim):
    with get_db() as conn:
        product = conn.execute(
            "SELECT id FROM products WHERE id = ?",
            (claim.product_id,)
        ).fetchone()

        if not product:
            raise HTTPException(
                status_code=404,
                detail="Product not found."
            )

        cursor = conn.execute("""
            INSERT INTO claims (
                product_id,
                issue,
                description,
                status,
                evidence_file,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            claim.product_id,
            claim.issue.strip(),
            claim.description.strip(),
            "Submitted",
            claim.evidence_file.strip(),
            datetime.now().isoformat()
        ))

        conn.commit()
        claim_id = cursor.lastrowid

    return {
        "message": "Claim submitted successfully",
        "claim_id": claim_id
    }


# GET ALL CLAIMS
@app.get("/claims")
def get_claims():
    with get_db() as conn:
        rows = conn.execute("""
            SELECT
                claims.*,
                products.name AS product_name,
                products.brand AS product_brand,
                products.purchase_date AS product_purchase_date,
                products.warranty_end AS product_warranty_end
            FROM claims
            LEFT JOIN products
            ON claims.product_id = products.id
            ORDER BY claims.id DESC
        """).fetchall()

    return [dict(row) for row in rows]


# UPDATE CLAIM STATUS
@app.patch("/claims/{claim_id}")
def update_claim(
    claim_id: int,
    status: Optional[str] = Query(None),
    payload: Optional[ClaimStatusUpdate] = None
):
    resolved_status = (payload.status if payload else status)

    allowed_statuses = [
        "Submitted",
        "Under Review",
        "Approved",
        "Rejected",
        "Resolved"
    ]

    if not resolved_status or resolved_status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid claim status. Must be one of: {', '.join(allowed_statuses)}"
        )

    with get_db() as conn:
        cursor = conn.execute("""
            UPDATE claims
            SET status = ?
            WHERE id = ?
        """, (resolved_status, claim_id))

        conn.commit()
        updated = cursor.rowcount

    if updated == 0:
        raise HTTPException(
            status_code=404,
            detail="Claim not found."
        )

    return {
        "message": "Claim status updated successfully",
        "claim_id": claim_id,
        "status": resolved_status
    }


# DELETE CLAIM
@app.delete("/claims/{claim_id}")
def delete_claim(claim_id: int):
    with get_db() as conn:
        cursor = conn.execute("DELETE FROM claims WHERE id = ?", (claim_id,))
        conn.commit()
        deleted = cursor.rowcount

    if deleted == 0:
        raise HTTPException(status_code=404, detail="Claim not found.")

    return {"message": "Claim deleted successfully"}


# GEMINI MULTIMODAL INVOICE EXTRACTION (BUILDATHON SHOWCASE)
@app.post("/extract-invoice")
async def extract_invoice(file: UploadFile = File(...)):
    allowed = {
        ".pdf": "application/pdf",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png"
    }

    ext = Path(file.filename or "").suffix.lower()
    if ext not in allowed:
        raise HTTPException(
            status_code=400,
            detail="Unsupported format. Please upload a PDF, PNG, or JPG invoice."
        )

    content = await file.read()
    if not content or len(content) > 10 * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail="File must be non-empty and under 10 MB."
        )

    mime_type = allowed[ext]
    part = types.Part.from_bytes(data=content, mime_type=mime_type)

    extraction_prompt = """
    You are an expert Indian consumer invoice parser for ClaimSaathi AI.
    Extract the product purchase details from this invoice or bill document.

    Return ONLY a valid JSON object matching the following structure:
    {
        "name": "Full product name and model",
        "brand": "Brand or manufacturer name",
        "purchase_date": "YYYY-MM-DD",
        "warranty_months": 12,
        "purchase_price": 0.0,
        "retailer": "Retailer or platform name (e.g. Amazon, Flipkart, Croma, Reliance Digital)",
        "invoice_no": "Invoice or bill number if present",
        "summary": "1-sentence summary of the purchase"
    }

    Rules:
    1. If purchase date format in invoice is DD/MM/YYYY or similar, convert it strictly to YYYY-MM-DD.
    2. Default warranty_months to 12 if not explicitly specified.
    3. Remove currency symbols like Rs or INR from purchase_price; provide only the numeric float.
    4. Provide only pure, valid JSON without any markdown formatting or code blocks.
    """

    try:
        response = client.models.generate_content(
            model="gemini-3.5-flash-lite",
            contents=[part, extraction_prompt]
        )

        raw_text = (response.text or "").strip()
        clean_json = re.sub(r"^```(?:json)?\s*", "", raw_text, flags=re.MULTILINE)
        clean_json = re.sub(r"\s*```$", "", clean_json, flags=re.MULTILINE).strip()

        extracted = json.loads(clean_json)

        purchase_date = extracted.get("purchase_date", "")
        try:
            datetime.strptime(purchase_date, "%Y-%m-%d")
        except Exception:
            extracted["purchase_date"] = date.today().isoformat()

        stored_filename = f"{uuid.uuid4().hex}{ext}"
        file_path = UPLOAD_DIR / stored_filename
        file_path.write_bytes(content)

        with get_db() as conn:
            cursor = conn.execute("""
                INSERT INTO documents (
                    filename,
                    stored_filename,
                    file_path,
                    uploaded_at
                )
                VALUES (?, ?, ?, ?)
            """, (
                Path(file.filename).name,
                stored_filename,
                str(file_path),
                datetime.now().isoformat()
            ))
            conn.commit()
            doc_id = cursor.lastrowid

        extracted["document_id"] = doc_id
        extracted["file_url"] = f"/uploads/invoices/{stored_filename}"
        extracted["filename"] = Path(file.filename).name

        return extracted

    except json.JSONDecodeError:
        return {
            "name": Path(file.filename).stem.replace("_", " ").title(),
            "brand": "",
            "purchase_date": date.today().isoformat(),
            "warranty_months": 12,
            "purchase_price": 0,
            "retailer": "",
            "invoice_no": "",
            "summary": "Document uploaded successfully. Please verify extracted fields."
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Gemini invoice extraction error: {str(e)}"
        )


# AI CLAIM LETTER & LEGAL NOTICE GENERATOR (BUILDATHON SHOWCASE)
@app.post("/generate-claim-letter")
def generate_claim_letter(request: ClaimLetterRequest):
    with get_db() as conn:
        product = conn.execute("SELECT * FROM products WHERE id = ?", (request.product_id,)).fetchone()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")

    prompt = f"""
    You are ClaimSaathi AI, a consumer protection advocate specializing in Indian Consumer Law (Consumer Protection Act, 2019).
    Generate a formal warranty claim package for the following case:

    PRODUCT DETAILS:
    - Product: {product['name']}
    - Brand: {product['brand'] or 'Manufacturer'}
    - Purchase Date: {product['purchase_date']}
    - Warranty Expiry Date: {product['warranty_end']}
    - Purchase Price: Rs. {product['purchase_price']}
    - Retailer: {product['retailer'] or 'Authorized Retailer'}
    - Invoice No: {product['invoice_no'] or 'Attached Invoice'}

    CONSUMER CLAIM DETAILS:
    - Claimant Name: {request.consumer_name}
    - Issue / Defect: {request.issue}
    - Detailed Description: {request.description}
    - Desired Redressal: {request.desired_resolution}

    Generate a complete, professionally formatted package containing:
    1. FORMAL WARRANTY CLAIM EMAIL / LETTER (addressed to the brand's Head of Customer Support and Authorized Service Center).
    2. LEGAL NOTICE DRAFT under Section 2(47) (Unfair Trade Practice) & Section 84-86 (Product Liability) of Consumer Protection Act, 2019, giving 15 days notice before approaching the District Consumer Disputes Redressal Commission.
    3. NATIONAL CONSUMER HELPLINE (NCH 1915) GRIEVANCE SUMMARY (brief, bulleted text ready to paste into the consumer helpline portal).

    Format clearly with markdown headings, professional tone, and placeholder fields where needed.
    """

    try:
        response = client.models.generate_content(
            model="gemini-3.5-flash-lite",
            contents=[prompt]
        )

        return {
            "product_name": product["name"],
            "product_brand": product["brand"],
            "warranty_end": product["warranty_end"],
            "legal_package": response.text
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# CONTEXT-AWARE GEMINI AI CHAT API
@app.post("/chat")
def chat(request: ChatRequest):
    with get_db() as conn:
        products = conn.execute("SELECT id, name, brand, purchase_date, warranty_end, warranty_months, purchase_price FROM products ORDER BY id DESC").fetchall()
        claims = conn.execute("""
            SELECT claims.id, claims.issue, claims.status, claims.created_at, products.name AS product_name
            FROM claims
            LEFT JOIN products ON claims.product_id = products.id
            ORDER BY claims.id DESC
        """).fetchall()

    today_str = date.today().isoformat()

    products_context = "\n".join([
        f"- Product #{p['id']}: {p['name']} (Brand: {p['brand'] or 'N/A'}), Bought: {p['purchase_date']}, Warranty Ends: {p['warranty_end']}, Cost: Rs. {p['purchase_price']}"
        for p in products
    ]) or "No products registered in account yet."

    claims_context = "\n".join([
        f"- Claim #{c['id']} for '{c['product_name']}': Issue '{c['issue']}', Status: {c['status']}, Filed: {c['created_at'][:10]}"
        for c in claims
    ]) or "No claims submitted yet."

    system_instruction = f"""
    You are ClaimSaathi AI, India's leading AI consumer protection advocate and warranty advisor.
    Today's Date: {today_str}

    USER'S REGISTERED PRODUCTS IN CLAIMSATHI:
    {products_context}

    USER'S SUBMITTED CLAIMS:
    {claims_context}

    Your Mission:
    1. Protect consumer rights under the Consumer Protection Act, 2019 and relevant Indian warranty laws.
    2. Answer questions about registered products, warranty statuses, expiry dates, and coverage.
    3. Help draft warranty claims, consumer forum grievances, and National Consumer Helpline (NCH 1915 / consumerhelpline.gov.in) complaints.
    4. Provide clear, empathetic, practical, and legally grounded steps.

    Formatting:
    - Use clear markdown with bold headers, bullet points, and numbered action steps.
    - If user asks about their products or warranties, directly reference their registered products from the context above!
    """

    chat_contents = [system_instruction]
    for hist in (request.history or [])[-6:]:
        chat_contents.append(f"{hist.role.upper()}: {hist.text}")
    chat_contents.append(f"USER: {request.message}")

    try:
        response = client.models.generate_content(
            model="gemini-3.5-flash-lite",
            contents=chat_contents
        )

        return {
            "reply": response.text
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )