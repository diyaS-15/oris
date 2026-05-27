# Upload router — receives course files, parses them into chunks, and stores everything in Postgres.
from fastapi import APIRouter, File, Form, UploadFile, HTTPException
from db.supabase import get_client
from services.ingestion.parser import parse_file

router = APIRouter(prefix="/api/v1")


@router.post("/upload")
async def upload_files(
    course_name: str = Form(...),
    user_id: str = Form(...),
    files: list[UploadFile] = File(...),
):
    db = get_client()

    # Create the course record with status 'processing'
    course_resp = db.table("courses").insert({
        "user_id": user_id,
        "name": course_name,
        "status": "processing",
    }).execute()

    course_id = course_resp.data[0]["id"]

    # Parse each file and store its chunks
    for upload in files:
        filename = upload.filename or "upload"
        file_bytes = await upload.read()

        # Label as 'practice' if the filename contains exam/homework/quiz keywords
        practice_keywords = ("exam", "hw", "homework", "quiz", "midterm", "final", "practice")
        source_type = "practice" if any(kw in filename.lower() for kw in practice_keywords) else "slide"

        try:
            chunks = parse_file(filename, file_bytes, source_type)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        if chunks:
            db.table("chunks").insert([
                {
                    "course_id": course_id,
                    "content": chunk.content,
                    "source_file": chunk.source_file,
                    "source_type": chunk.source_type,
                    "page_or_slide_number": chunk.page_or_slide_number,
                }
                for chunk in chunks
            ]).execute()

    return {"course_id": course_id, "status": "processing"}
