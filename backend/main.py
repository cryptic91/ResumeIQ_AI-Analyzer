import os
import tempfile
import traceback
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
import pypdf

from analyzer import analyze_resume

# Load .env from the backend directory
load_dotenv(Path(__file__).parent / ".env")

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"

app = FastAPI(title="AI Resume Analyzer", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

# Serve static assets
app.mount(
    "/static",
    StaticFiles(directory=FRONTEND_DIR / "static"),
    name="static",
)


@app.get("/")
async def index():
    return FileResponse(FRONTEND_DIR / "index.html")


@app.post("/analyze")
async def analyze(
    resume: UploadFile = File(..., description="PDF resume file"),
    job_description: str = Form(..., description="Job description text"),
):
    # Validate file type
    if not (resume.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    # Validate API key
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY is not configured. Add it to backend/.env",
        )

    # Validate job description
    if not job_description.strip():
        raise HTTPException(status_code=400, detail="Job description cannot be empty.")

    # Read PDF content into a temp file — resume is never persisted
    pdf_bytes = await resume.read()
    if len(pdf_bytes) > 10 * 1024 * 1024:  # 10 MB limit
        raise HTTPException(status_code=400, detail="PDF file too large (max 10 MB).")

    resume_text = _extract_text(pdf_bytes)
    if not resume_text.strip():
        raise HTTPException(
            status_code=400,
            detail="Could not extract text from the PDF. Make sure it is not scanned/image-only.",
        )

    try:
        result = analyze_resume(resume_text, job_description, api_key)
    except Exception as exc:
        traceback.print_exc()   # full traceback printed to server terminal
        raise HTTPException(
            status_code=502,
            detail=f"AI analysis failed: {str(exc)}",
        )

    return result


def _extract_text(pdf_bytes: bytes) -> str:
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(pdf_bytes)
        tmp_path = tmp.name

    try:
        reader = pypdf.PdfReader(tmp_path)
        pages = [page.extract_text() or "" for page in reader.pages]
        return "\n".join(pages)
    finally:
        os.unlink(tmp_path)
