# Orchestrates the full ingestion pipeline: extract concepts → store → build graph → mark course ready.
import traceback

from db.supabase import get_client
from services.extraction import spacy_extractor, cluster_extractor
from services.graph import graph_builder
from services.ingestion import embedder


def run_pipeline(course_id: str) -> None:
    print(f"\n[pipeline] Starting for course {course_id}")
    db = get_client()

    try:
        # --- Stage 1: Load chunks ---
        print(f"[pipeline] Stage 1: Loading chunks from database")
        chunks_resp = (
            db.table("chunks")
            .select("id, content, source_type")
            .eq("course_id", course_id)
            .execute()
        )
        chunks = chunks_resp.data
        practice_chunks = [c for c in chunks if c["source_type"] == "practice"]
        slide_chunks = [c for c in chunks if c["source_type"] == "slide"]
        print(f"[pipeline] Found {len(chunks)} chunks ({len(practice_chunks)} practice, {len(slide_chunks)} slides)")

        # --- Stage 2: Generate embeddings ---
        print(f"[pipeline] Stage 2: Generating embeddings for {len(chunks)} chunks")
        embedder.embed_chunks(db, chunks)
        print(f"[pipeline] Embeddings stored")

        # --- Stage 3: Concept extraction ---
        if practice_chunks:
            print(f"[pipeline] Stage 3: Running spaCy extraction on {len(practice_chunks)} practice chunks")
            extracted = spacy_extractor.extract_concepts(practice_chunks)
            slides_only = False
        else:
            print(f"[pipeline] Stage 3: No practice chunks — running cluster extraction on {len(slide_chunks)} slides")
            extracted = cluster_extractor.extract_concepts(slide_chunks)
            slides_only = True

        print(f"[pipeline] Extracted {len(extracted)} concepts")

        if not extracted:
            print(f"[pipeline] ERROR: No concepts extracted — marking course as error")
            db.table("courses").update({"status": "error"}).eq("id", course_id).execute()
            return

        # --- Stage 4: Store concepts ---
        print(f"[pipeline] Stage 4: Storing concepts in database")
        concept_rows = [
            {
                "course_id": course_id,
                "name": c.name,
                "exam_weight": c.exam_weight,
                "reviewed": False,
            }
            for c in extracted
        ]
        inserted = db.table("concepts").insert(concept_rows).execute().data
        name_to_id = {c["name"]: c["id"] for c in inserted}
        print(f"[pipeline] Stored {len(inserted)} concepts")

        # Store concept-chunk links
        links = [
            {"concept_id": name_to_id[ext.name], "chunk_id": chunk_id}
            for ext in extracted
            if ext.name in name_to_id
            for chunk_id in ext.chunk_ids
        ]
        if links:
            db.table("concept_chunks").insert(links).execute()
            print(f"[pipeline] Stored {len(links)} concept-chunk links")

        # --- Stage 5: Build graph ---
        print(f"[pipeline] Stage 5: Building concept graph edges")
        graph_builder.build_graph(db, course_id, inserted)
        print(f"[pipeline] Graph edges stored")

        # --- Done ---
        status = "ready_slides_only" if slides_only else "ready"
        db.table("courses").update({"status": status}).eq("id", course_id).execute()
        print(f"[pipeline] Complete — status: {status}\n")

    except Exception:
        print(f"[pipeline] FAILED for course {course_id}:")
        traceback.print_exc()
        db.table("courses").update({"status": "error"}).eq("id", course_id).execute()
