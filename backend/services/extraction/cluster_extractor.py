# Fallback concept extractor for slides-only courses — clusters slide embeddings and labels each cluster.
from dataclasses import dataclass, field

_nlp = None
_model = None

def _get_nlp():
    global _nlp
    if _nlp is None:
        import spacy
        _nlp = spacy.load("en_core_web_sm")
    return _nlp

def _get_model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


@dataclass
class ExtractedConcept:
    name: str
    exam_weight: float
    chunk_ids: list[str] = field(default_factory=list)


def extract_concepts(chunks: list[dict]) -> list[ExtractedConcept]:
    """
    chunks: list of {"id": str, "content": str} rows from the chunks table.
    Returns one concept per cluster, all with exam_weight=0.5 (unknown without practice materials).
    """
    if len(chunks) < 2:
        return []

    import numpy as np
    from sklearn.cluster import KMeans

    model = _get_model()

    contents = [c["content"] for c in chunks]
    embeddings = model.encode(contents, show_progress_bar=False)

    n_clusters = min(20, max(2, len(chunks) // 3))
    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    labels = kmeans.fit_predict(embeddings)

    concepts = []
    for cluster_id in range(n_clusters):
        indices = [i for i, label in enumerate(labels) if label == cluster_id]
        cluster_chunks = [chunks[i] for i in indices]

        name = _label_cluster(cluster_chunks)
        if name:
            concepts.append(ExtractedConcept(
                name=name,
                exam_weight=0.5,
                chunk_ids=[c["id"] for c in cluster_chunks],
            ))

    return concepts


def _label_cluster(cluster_chunks: list[dict]) -> str:
    """Finds the most frequent multi-word noun phrase across all chunks in the cluster."""
    nlp = _get_nlp()
    stopwords = nlp.Defaults.stop_words

    combined = " ".join(c["content"] for c in cluster_chunks)
    doc = nlp(combined[:50_000])

    freq: dict[str, int] = {}
    for nc in doc.noun_chunks:
        term = nc.text.strip().lower()
        words = term.split()
        if len(words) >= 2 and not all(w in stopwords for w in words):
            freq[term] = freq.get(term, 0) + 1

    if not freq:
        return ""

    return max(freq, key=lambda t: freq[t])
