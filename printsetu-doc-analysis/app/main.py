"""
PrintSetu document-analysis service (SRS §10.1 / §14).

A small, standalone FastAPI service invoked by the NestJS backend
(printsetu-backend/src/documents/analysis-client.service.ts) to compute
PDF page counts and a best-effort color/BW page count using PyMuPDF, and
to classify a single JPG/PNG upload. Kept out-of-process so the analysis
engine can be scaled or swapped independently of the main API.
"""
import io
import logging

import fitz  # PyMuPDF
from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

from .color_detection import analyze_image, analyze_pdf

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("printsetu-doc-analysis")

app = FastAPI(title="PrintSetu Document Analysis Service", version="1.0.0")

MAX_BYTES = 30 * 1024 * 1024


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    content = await file.read()
    if not content:
        raise HTTPException(status_code=422, detail="Empty file.")
    if len(content) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds analysis size limit.")

    content_type = (file.content_type or "").lower()

    try:
        if content_type == "application/pdf" or file.filename.lower().endswith(".pdf"):
            with fitz.open(stream=content, filetype="pdf") as doc:
                if doc.page_count == 0:
                    raise HTTPException(status_code=422, detail="PDF has no pages.")
                page_count, color_pages, confidence = analyze_pdf(doc)
        elif content_type in ("image/jpeg", "image/png") or file.filename.lower().endswith(
            (".jpg", ".jpeg", ".png")
        ):
            image = Image.open(io.BytesIO(content))
            image.load()
            page_count, color_pages, confidence = analyze_image(image)
        else:
            raise HTTPException(status_code=422, detail=f"Unsupported content type: {content_type}")
    except HTTPException:
        raise
    except (UnidentifiedImageError, RuntimeError, ValueError) as error:
        logger.warning("Analysis failed for %s: %s", file.filename, error)
        raise HTTPException(status_code=422, detail="Could not analyze this document.") from error

    return {
        "pageCount": page_count,
        "colorPages": color_pages,
        "confidence": confidence,
    }
