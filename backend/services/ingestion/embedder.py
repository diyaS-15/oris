_model = None

def _get_model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


BATCH_SIZE = 64


def embed_chunks(db, chunks: list[dict]) -> None:
    """
    Encodes chunk content with all-MiniLM-L6-v2 and writes 384-dim vectors
    to the embedding column on the chunks table.
    chunks: list of {"id": str, "content": str, ...}
    """
    if not chunks:
        return

    model = _get_model()

    for batch_start in range(0, len(chunks), BATCH_SIZE):
        batch = chunks[batch_start : batch_start + BATCH_SIZE]
        texts = [c["content"] for c in batch]
        vectors = model.encode(texts, show_progress_bar=False)

        for chunk, vec in zip(batch, vectors):
            db.table("chunks").update(
                {"embedding": vec.tolist()}
            ).eq("id", chunk["id"]).execute()


def link_concepts_to_slide_chunks(db, course_id: str, concepts: list[dict]) -> int:
    """
    For each concept, embeds its name and finds the top 5 most similar slide
    chunks via pgvector cosine similarity, then inserts concept_chunks links.
    concepts: list of {"id": str, "name": str} dicts.
    Returns total number of links inserted.
    """
    if not concepts:
        return 0

    model = _get_model()
    total_links = 0

    for concept in concepts:
        vec = model.encode(concept["name"], show_progress_bar=False).tolist()
        vec_str = "[" + ",".join(str(v) for v in vec) + "]"

        # pgvector cosine distance operator: <=>
        rows = db.rpc(
            "match_slide_chunks",
            {"p_course_id": course_id, "p_embedding": vec_str, "p_limit": 5},
        ).execute().data

        links = [
            {"concept_id": concept["id"], "chunk_id": row["id"]}
            for row in rows
        ]
        if links:
            db.table("concept_chunks").insert(links).execute()
            total_links += len(links)

    return total_links
