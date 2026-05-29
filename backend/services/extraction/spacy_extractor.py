# Extracts weighted concepts from practice material chunks (exams, homework, quizzes) using spaCy.
import re
from dataclasses import dataclass, field

_nlp = None

def _get_nlp():
    global _nlp
    if _nlp is None:
        import spacy
        _nlp = spacy.load("en_core_web_sm")
    return _nlp


# Single-word terms that look generic but are actually important technical concepts.
TECHNICAL_WHITELIST = {
    "bert", "gpt", "rlhf", "bm25", "lstm", "relu", "cnn", "rnn", "gan",
    "sql", "api", "tcp", "udp", "dns", "http", "ssl", "tls", "rsa", "aes",
    "heap", "tree", "graph", "hash", "cache", "mutex", "lock", "fork",
    "bayes", "entropy", "gradient", "kernel", "tensor", "vector", "matrix",
}

# Single words that are never concepts regardless of frequency.
SINGLE_WORD_BLOCKLIST = {
    "zero", "thought", "information", "text", "documents", "statement",
    "need", "limitation", "situation", "reason", "option", "difference",
    "issue", "idea", "type", "role", "way", "part", "example", "answer",
    "question", "document", "data", "result", "results", "value", "values",
    "number", "numbers", "thing", "things", "ways", "parts", "types",
    "case", "cases", "point", "points", "item", "items", "note", "notes",
    "use", "uses", "one", "two", "set", "sets", "problem", "problems",
    # Fix 3 additions
    "examples", "accuracy", "speech", "probabilities", "token", "training",
    "queries", "sequence", "output", "input", "model",
    # Fix 4 additions
    "time", "tokens", "blank", "system",
    "symbols", "task", "randomness", "words",
}

# Multi-word phrases that are never concepts regardless of frequency.
MULTI_WORD_BLOCKLIST = {
    "which statement", "key limitation", "a key limitation",
    "following statement", "key difference", "main difference",
    "primary reason", "key reason", "key advantage", "key characteristic",
    # Fix 4 additions
    "other tokens", "what type",
}

# Substrings and patterns that indicate a file path leaked into a concept name.
_FILE_PATH_SUBSTRINGS = {"downloads", "users", "http", "www", "file"}
_FILE_PATH_CHARS = {"/", "\\"}

# Regex patterns that identify metadata rather than content.
_DATE_RE = re.compile(r"^\d{1,2}/\d{1,2}/\d{2,4}$")
_TIME_RE = re.compile(r"^\d{1,2}:\d{2}\s*(am|pm)$", re.IGNORECASE)
_HEADER_MAJORITY_RE = re.compile(r"\b(quiz|exam|homework|test|midterm|final)\b", re.IGNORECASE)
# Matches tokens that look like file paths: contain slashes and no spaces
_FILE_PATH_TOKEN_RE = re.compile(r"^\S*[/\\]\S+$")

LEADING_ARTICLES = {"the", "a", "an"}

# Strips leading answer/question prefixes like "a.", "B.", "Q1.", "Q2." from lines
# so "a. Encoder-only" becomes "Encoder-only" before spaCy sees it.
_LINE_PREFIX_RE = re.compile(r"^(?:[a-dA-D][.)]\s*|Q\d+\.\s*)")


def _is_metadata_chunk(text: str) -> bool:
    """Returns True for file headers, dates, times, and other non-content chunks."""
    stripped = text.strip()
    if len(stripped) < 20:
        return True
    if _DATE_RE.match(stripped) or _TIME_RE.match(stripped):
        return True
    words = stripped.lower().split()
    header_hits = sum(1 for w in words if _HEADER_MAJORITY_RE.match(w))
    if len(words) > 0 and header_hits / len(words) > 0.5:
        return True
    return False


def _strip_line_prefixes(text: str) -> str:
    """Removes leading answer/question prefixes from each line, keeping content intact."""
    return "\n".join(
        _LINE_PREFIX_RE.sub("", line) for line in text.splitlines()
    )


def _strip_file_path_lines(text: str) -> str:
    """Removes lines that look like file paths before passing content to spaCy."""
    clean_lines = []
    for line in text.splitlines():
        stripped = line.strip()
        lower = stripped.lower()
        if "file:///" in lower or "c:\\users" in lower or "/downloads" in lower:
            continue
        if _FILE_PATH_TOKEN_RE.match(stripped):
            continue
        clean_lines.append(line)
    return "\n".join(clean_lines)


def _is_file_path_concept(term: str) -> bool:
    """Returns True if an extracted concept looks like a file path fragment."""
    lower = term.lower()
    if any(sub in lower for sub in _FILE_PATH_SUBSTRINGS):
        return True
    if any(ch in term for ch in _FILE_PATH_CHARS):
        return True
    return False


def _normalize(term: str, stopwords: set) -> str | None:
    """
    Strips leading articles, lower-cases, and returns None if the term
    fails the quality filter.
    """
    words = term.strip().lower().split()
    if not words:
        return None

    # Strip leading articles
    while words and words[0] in LEADING_ARTICLES:
        words = words[1:]

    if not words:
        return None

    normalized = " ".join(words)

    # Length gate
    if len(normalized) < 3:
        return None

    # Multi-word blocklist (checked before single-word path)
    if normalized in MULTI_WORD_BLOCKLIST:
        return None

    # Single-word checks
    if len(words) == 1:
        word = words[0]
        if word in TECHNICAL_WHITELIST:
            return normalized
        if word in SINGLE_WORD_BLOCKLIST or word in stopwords:
            return None

    # Multi-word: reject if all words are stopwords
    if all(w in stopwords for w in words):
        return None

    return normalized


@dataclass
class ExtractedConcept:
    name: str
    exam_weight: float
    chunk_ids: list[str] = field(default_factory=list)


def extract_concepts(practice_chunks: list[dict]) -> list[ExtractedConcept]:
    """
    practice_chunks: list of {"id": str, "content": str} rows from the chunks table.
    Returns up to 30 concepts sorted by exam_weight descending.
    """
    nlp = _get_nlp()
    stopwords = nlp.Defaults.stop_words

    # Map normalized term -> set of chunk IDs
    term_chunks: dict[str, set[str]] = {}

    for chunk in practice_chunks:
        if _is_metadata_chunk(chunk["content"]):
            continue

        # (a) Strip line prefixes and file path lines before spaCy sees the content
        clean_content = _strip_line_prefixes(chunk["content"])
        clean_content = _strip_file_path_lines(clean_content)
        doc = nlp(clean_content[:100_000])
        raw_terms: set[str] = set()

        for nc in doc.noun_chunks:
            raw_terms.add(nc.text.strip())

        for ent in doc.ents:
            raw_terms.add(ent.text.strip())

        for raw in raw_terms:
            normalized = _normalize(raw, stopwords)
            if normalized is None:
                continue
            # (b) Post-extraction file path filter
            if _is_file_path_concept(normalized):
                continue
            term_chunks.setdefault(normalized, set()).add(chunk["id"])

    if not term_chunks:
        return []

    # Keep only terms that appear in 2+ chunks, or are whitelisted technical terms.
    term_chunks = {
        term: ids
        for term, ids in term_chunks.items()
        if len(ids) >= 2 or term in TECHNICAL_WHITELIST
    }

    if not term_chunks:
        return []

    max_count = max(len(ids) for ids in term_chunks.values())

    concepts = [
        ExtractedConcept(
            name=term,
            exam_weight=round(len(ids) / max_count, 4),
            chunk_ids=list(ids),
        )
        for term, ids in term_chunks.items()
    ]

    concepts.sort(key=lambda c: c.exam_weight, reverse=True)
    return concepts[:30]
