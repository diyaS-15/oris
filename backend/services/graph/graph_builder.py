# Builds the knowledge graph by computing cosine similarity between concept embeddings and storing edges.
# Note: stores edges in a concept_edges Postgres table instead of Apache AGE (not available on Supabase).

_model = None

def _get_model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


def build_graph(db, course_id: str, concepts: list[dict]) -> None:
    """
    concepts: list of {"id": str, "name": str} dicts (just-inserted rows).
    Creates 'related' edges for pairs with cosine similarity > 0.3.
    Guarantees every concept has at least one edge to its nearest neighbor.
    """
    if len(concepts) < 2:
        return

    import numpy as np

    model = _get_model()
    names = [c["name"] for c in concepts]
    embeddings = model.encode(names, show_progress_bar=False).astype(float)

    # Normalize rows so dot product == cosine similarity
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    embeddings = embeddings / (norms + 1e-8)
    sim_matrix = embeddings @ embeddings.T

    # Set diagonal to -1 so it never wins the "nearest neighbor" check
    np.fill_diagonal(sim_matrix, -1.0)

    THRESHOLD = 0.3
    edge_set: set[tuple[int, int]] = set()

    # All pairs above threshold
    for i in range(len(concepts)):
        for j in range(i + 1, len(concepts)):
            if float(sim_matrix[i, j]) > THRESHOLD:
                edge_set.add((i, j))

    # Guarantee every concept has at least one edge to its nearest neighbor
    for i in range(len(concepts)):
        j = int(np.argmax(sim_matrix[i]))
        pair = (min(i, j), max(i, j))
        edge_set.add(pair)

    edges = [
        {
            "course_id": course_id,
            "source_concept_id": concepts[i]["id"],
            "target_concept_id": concepts[j]["id"],
            "edge_type": "related",
            "weight": round(float(sim_matrix[i, j]), 4),
        }
        for i, j in edge_set
    ]

    if edges:
        db.table("concept_edges").insert(edges).execute()
