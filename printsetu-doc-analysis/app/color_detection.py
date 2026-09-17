"""
Page-level color detection heuristics.

SRS §10.1 is explicit that exact billing-grade color detection cannot be
guaranteed for every PDF, and asks for a documented rule plus an admin
override policy rather than a black box. The approach here, in priority
order per page, is:

  1. Inspect actual text span colors (cheap, exact for vector text).
  2. Inspect vector drawing stroke/fill colors (exact for vector art).
  3. Inspect embedded raster images by sampling pixels for channel
     divergence (approximate — a scanned grayscale photo saved in an RGB
     colorspace would otherwise register as "color").

A page is COLOR if any of the three finds non-gray content. This is a
conservative/documented heuristic, not a certified color-separation engine.
"""
from typing import Tuple

import fitz  # PyMuPDF

GRAY_CHANNEL_TOLERANCE = 10  # max channel-to-channel delta considered "gray"
PIXEL_SAMPLE_LIMIT = 400


def _is_gray_rgb(r: int, g: int, b: int, tolerance: int = GRAY_CHANNEL_TOLERANCE) -> bool:
    return max(r, g, b) - min(r, g, b) <= tolerance


def _text_has_color(page: "fitz.Page") -> bool:
    try:
        text_dict = page.get_text("dict")
    except Exception:
        return False
    for block in text_dict.get("blocks", []):
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                color_int = span.get("color", 0)
                r = (color_int >> 16) & 255
                g = (color_int >> 8) & 255
                b = color_int & 255
                if not _is_gray_rgb(r, g, b):
                    return True
    return False


def _drawings_have_color(page: "fitz.Page") -> bool:
    try:
        drawings = page.get_drawings()
    except Exception:
        return False
    for drawing in drawings:
        for key in ("color", "fill"):
            value = drawing.get(key)
            if value and len(value) >= 3:
                r, g, b = (int(c * 255) for c in value[:3])
                if not _is_gray_rgb(r, g, b):
                    return True
    return False


def _images_have_color(doc: "fitz.Document", page: "fitz.Page") -> bool:
    for img in page.get_images(full=True):
        xref = img[0]
        try:
            pix = fitz.Pixmap(doc, xref)
            if pix.colorspace is None or pix.n < 3:
                continue  # already grayscale/mask colorspace
            if pix.alpha:
                pix = fitz.Pixmap(pix, 0)
            samples = pix.samples
            channel_count = pix.n
            total_pixels = len(samples) // channel_count
            if total_pixels == 0:
                continue
            step = max(1, total_pixels // PIXEL_SAMPLE_LIMIT)
            for i in range(0, total_pixels, step):
                offset = i * channel_count
                r, g, b = samples[offset], samples[offset + 1], samples[offset + 2]
                if not _is_gray_rgb(r, g, b, tolerance=18):
                    return True
        except Exception:
            continue
    return False


def analyze_pdf(doc: "fitz.Document") -> Tuple[int, int, str]:
    page_count = doc.page_count
    color_pages = 0
    for page in doc:
        if _text_has_color(page) or _drawings_have_color(page) or _images_have_color(doc, page):
            color_pages += 1
    return page_count, color_pages, "HIGH"


def analyze_image(image) -> Tuple[int, int, str]:
    """A standalone JPG/PNG upload is always exactly one printable page."""
    rgb = image.convert("RGB")
    width, height = rgb.size
    total_pixels = width * height
    step = max(1, total_pixels // PIXEL_SAMPLE_LIMIT)
    pixels = rgb.getdata()
    is_color = False
    for i in range(0, total_pixels, step):
        r, g, b = pixels[i]
        if not _is_gray_rgb(r, g, b, tolerance=18):
            is_color = True
            break
    return 1, (1 if is_color else 0), "HIGH" if image.mode in ("L", "1") else "LOW"
