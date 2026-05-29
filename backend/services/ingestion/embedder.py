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
