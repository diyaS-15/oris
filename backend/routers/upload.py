# Upload router — creates a new course, stores files + metadata, checks for duplicates, kicks off pipeline.
from fastapi import APIRouter, BackgroundTasks, File, Form, UploadFile, HTTPException
from db.supabase import get_client
from services.ingestion.parser import parse_file
from services.ingestion.pipeline import run_pipeline

router = APIRouter(prefix="/api/v1")


async def _read_and_validate_files(
    files: list[UploadFile],
    source_types: list[str],
) -> list[tuple[str, bytes, str]]:
    """Reads all files into memory and checks for duplicates within the batch."""
    if len(files) != len(source_types):
        raise HTTPException(status_code=400, detail="files and source_types must have the same length")

    seen: set[tuple[str, int]] = set()
    result = []
    for upload, source_type in zip(files, source_types):
        if source_type not in ("slide", "practice"):
            raise HTTPException(status_code=400, detail=f"Invalid source_type: {source_type}")
        filename = upload.filename or "upload"
        file_bytes = await upload.read()
        key = (filename, len(file_bytes))
        if key in seen:
            raise HTTPException(status_code=409, detail=f"Duplicate file in upload: '{filename}'")
        seen.add(key)
        result.append((filename, file_bytes, source_type))
    return result


@router.post("/upload")
async def upload_files(
    background_tasks: BackgroundTasks,
    course_name: str = Form(...),
    user_id: str = Form(...),
    files: list[UploadFile] = File(...),
    source_types: list[str] = Form(...),
):
    validated = await _read_and_validate_files(files, source_types)

    db = get_client()

    course_resp = db.table("courses").insert({
        "user_id": user_id,
        "name": course_name,
        "status": "processing",
    }).execute()
    course_id = course_resp.data[0]["id"]

    for filename, file_bytes, source_type in validated:
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

        db.table("course_files").insert({
            "course_id": course_id,
            "filename": filename,
            "source_type": source_type,
            "size_bytes": len(file_bytes),
        }).execute()

    background_tasks.add_task(run_pipeline, course_id)
    return {"course_id": course_id, "status": "processing"}
