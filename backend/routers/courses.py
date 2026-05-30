# Courses router — course status, graph data, and file management (add / remove / clear).
from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, Query, UploadFile
from db.supabase import get_client
from services.ingestion.parser import parse_file
from services.ingestion.pipeline import run_pipeline
from routers.upload import _read_and_validate_files

router = APIRouter(prefix="/api/v1")


def _clear_derived_data(db, course_id: str) -> None:
    """Deletes concepts (cascades to concept_chunks + questions) and concept_edges for a course."""
    db.table("concepts").delete().eq("course_id", course_id).execute()
    db.table("concept_edges").delete().eq("course_id", course_id).execute()


# ---------------------------------------------------------------------------
# Course status
# ---------------------------------------------------------------------------

@router.get("/courses/{course_id}")
def get_course(course_id: str):
    db = get_client()
    resp = db.table("courses").select("id, name, created_at, status").eq("id", course_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Course not found")
    course = resp.data[0]
    count_resp = db.table("concepts").select("id", count="exact").eq("course_id", course_id).execute()
    course["concept_count"] = count_resp.count or 0
    return course


@router.delete("/courses/{course_id}")
def delete_course(course_id: str):
    db = get_client()
    resp = db.table("courses").delete().eq("id", course_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Course not found")
    return {"status": "deleted"}


# ---------------------------------------------------------------------------
# Graph data
# ---------------------------------------------------------------------------

@router.get("/courses/{course_id}/graph")
def get_graph(course_id: str):
    db = get_client()
    course_resp = db.table("courses").select("id, name, status").eq("id", course_id).execute()
    if not course_resp.data:
        raise HTTPException(status_code=404, detail="Course not found")

    concepts = db.table("concepts").select("id, name, exam_weight, reviewed").eq("course_id", course_id).execute().data
    edges = db.table("concept_edges").select("id, source_concept_id, target_concept_id, edge_type, weight").eq("course_id", course_id).execute().data

    return {"course": course_resp.data[0], "concepts": concepts, "edges": edges}


@router.get("/courses/{course_id}/concepts/{concept_id}/questions")
def get_concept_questions(course_id: str, concept_id: str):
    db = get_client()
    questions = (
        db.table("questions")
        .select("id, question, answer, citation")
        .eq("concept_id", concept_id)
        .execute()
        .data
    )
    return questions


@router.patch("/courses/{course_id}/concepts/{concept_id}")
def update_concept(course_id: str, concept_id: str, body: dict):
    db = get_client()
    allowed = {k: v for k, v in body.items() if k in {"reviewed"}}
    if not allowed:
        raise HTTPException(status_code=400, detail="No updatable fields provided")
    updated = (
        db.table("concepts")
        .update(allowed)
        .eq("id", concept_id)
        .eq("course_id", course_id)
        .execute()
        .data
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Concept not found")
    return updated[0]


@router.get("/courses/{course_id}/concepts/{concept_id}/sources")
def get_concept_sources(course_id: str, concept_id: str):
    db = get_client()
    links = (
        db.table("concept_chunks")
        .select("chunk_id")
        .eq("concept_id", concept_id)
        .execute()
        .data
    )
    if not links:
        return []
    chunk_ids = [l["chunk_id"] for l in links]
    chunks = (
        db.table("chunks")
        .select("source_file, source_type, page_or_slide_number")
        .in_("id", chunk_ids)
        .order("page_or_slide_number")
        .execute()
        .data
    )
    return chunks


@router.get("/courses/{course_id}/brief")
def get_brief(course_id: str):
    db = get_client()

    course_resp = db.table("courses").select("id, name, status").eq("id", course_id).execute()
    if not course_resp.data:
        raise HTTPException(status_code=404, detail="Course not found")

    concepts = (
        db.table("concepts")
        .select("id, name, exam_weight, reviewed")
        .eq("course_id", course_id)
        .order("exam_weight", desc=True)
        .limit(10)
        .execute()
        .data
    )

    result = []
    for concept in concepts:
        concept_id = concept["id"]

        questions = (
            db.table("questions")
            .select("id, question, answer, citation")
            .eq("concept_id", concept_id)
            .limit(3)
            .execute()
            .data
        )

        links = (
            db.table("concept_chunks")
            .select("chunk_id")
            .eq("concept_id", concept_id)
            .execute()
            .data
        )
        sources = []
        if links:
            chunk_ids = [l["chunk_id"] for l in links]
            raw_sources = (
                db.table("chunks")
                .select("source_file, source_type, page_or_slide_number")
                .in_("id", chunk_ids)
                .order("page_or_slide_number")
                .execute()
                .data
            )
            seen = set()
            for s in raw_sources:
                key = f"{s['source_file']}:{s['page_or_slide_number']}"
                if key not in seen:
                    seen.add(key)
                    sources.append(s)

        result.append({**concept, "questions": questions, "sources": sources})

    return {"course": course_resp.data[0], "concepts": result}


# ---------------------------------------------------------------------------
# File management
# ---------------------------------------------------------------------------

@router.get("/courses/{course_id}/files")
def list_files(course_id: str):
    db = get_client()
    resp = (
        db.table("course_files")
        .select("id, filename, source_type, size_bytes, uploaded_at")
        .eq("course_id", course_id)
        .order("uploaded_at")
        .execute()
    )
    return resp.data


@router.post("/courses/{course_id}/files")
async def add_files(
    course_id: str,
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    source_types: list[str] = Form(...),
):
    validated = await _read_and_validate_files(files, source_types)

    db = get_client()

    course_resp = db.table("courses").select("id").eq("id", course_id).execute()
    if not course_resp.data:
        raise HTTPException(status_code=404, detail="Course not found")

    # Duplicate check against files already in this course
    existing_resp = db.table("course_files").select("filename, size_bytes").eq("course_id", course_id).execute()
    existing = {(r["filename"], r["size_bytes"]) for r in existing_resp.data}

    for filename, file_bytes, _ in validated:
        if (filename, len(file_bytes)) in existing:
            raise HTTPException(status_code=409, detail=f"'{filename}' has already been uploaded to this course.")

    # Store new chunks + file metadata
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

    _clear_derived_data(db, course_id)
    db.table("courses").update({"status": "processing"}).eq("id", course_id).execute()
    background_tasks.add_task(run_pipeline, course_id)
    return {"status": "processing"}


@router.delete("/courses/{course_id}/files")
def remove_file(
    course_id: str,
    background_tasks: BackgroundTasks,
    filename: str = Query(...),
):
    db = get_client()

    db.table("chunks").delete().eq("course_id", course_id).eq("source_file", filename).execute()
    db.table("course_files").delete().eq("course_id", course_id).eq("filename", filename).execute()

    remaining = db.table("chunks").select("id").eq("course_id", course_id).limit(1).execute()
    _clear_derived_data(db, course_id)

    if remaining.data:
        db.table("courses").update({"status": "processing"}).eq("id", course_id).execute()
        background_tasks.add_task(run_pipeline, course_id)
        return {"status": "processing"}
    else:
        db.table("courses").update({"status": "needs_upload"}).eq("id", course_id).execute()
        return {"status": "needs_upload"}


@router.delete("/courses/{course_id}/materials")
def clear_materials(course_id: str):
    db = get_client()
    _clear_derived_data(db, course_id)
    db.table("chunks").delete().eq("course_id", course_id).execute()
    db.table("course_files").delete().eq("course_id", course_id).execute()
    db.table("courses").update({"status": "needs_upload"}).eq("id", course_id).execute()
    return {"status": "needs_upload"}
