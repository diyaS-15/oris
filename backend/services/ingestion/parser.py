# Parses uploaded PPTX and PDF files into a list of chunks, one per slide or page.
import io
from dataclasses import dataclass

import pdfplumber
from pptx import Presentation


@dataclass
class Chunk:
    content: str
    source_file: str
    source_type: str          # 'slide' | 'practice'
    page_or_slide_number: int


def parse_file(filename: str, file_bytes: bytes, source_type: str) -> list[Chunk]:
    ext = filename.rsplit(".", 1)[-1].lower()
    if ext == "pptx":
        return _parse_pptx(filename, file_bytes, source_type)
    elif ext == "pdf":
        return _parse_pdf(filename, file_bytes, source_type)
    else:
        raise ValueError(f"Unsupported file type: {ext}")


def _parse_pptx(filename: str, file_bytes: bytes, source_type: str) -> list[Chunk]:
    prs = Presentation(io.BytesIO(file_bytes))
    chunks = []
    for i, slide in enumerate(prs.slides, start=1):
        texts = []
        for shape in slide.shapes:
            if shape.has_text_frame:
                for para in shape.text_frame.paragraphs:
                    line = para.text.strip()
                    if line:
                        texts.append(line)
        content = "\n".join(texts)
        if content:
            chunks.append(Chunk(content=content, source_file=filename,
                                source_type=source_type, page_or_slide_number=i))
    return chunks


def _parse_pdf(filename: str, file_bytes: bytes, source_type: str) -> list[Chunk]:
    chunks = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for i, page in enumerate(pdf.pages, start=1):
            content = (page.extract_text() or "").strip()
            if content:
                chunks.append(Chunk(content=content, source_file=filename,
                                    source_type=source_type, page_or_slide_number=i))
    return chunks
