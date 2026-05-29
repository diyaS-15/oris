# Generates 5 practice questions per concept using Groq (llama3-8b-8192).
# Fetches the top 3 slide chunks linked to each concept as context.
import os
import time
import re

from groq import Groq


def _get_client():
    return Groq(api_key=os.environ["GROQ_API_KEY"])


def _generate_questions(client, concept_name: str, exam_weight: float, chunks: list[dict]) -> str:
    context = "\n\n".join([
        f"Source: {c['source_file']}, slide/page {c['page_or_slide_number']}\n{c['content']}"
        for c in chunks
    ])
    prompt = f"""You are a study assistant creating exam practice questions.

Concept: {concept_name}
Exam importance: {exam_weight}

Course material context:
{context}

Generate exactly 5 multiple choice questions about {concept_name} based ONLY on the context above.
Never use outside knowledge. Every question must be answerable from the context.

For each question output exactly this format:
QUESTION: [question text]
ANSWER: [correct answer with brief explanation]
CITATION: Source: [filename], slide/page [number]

Separate each question with ---"""

    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
    )
    return response.choices[0].message.content


def _parse_response(text: str) -> list[dict]:
    """Parses the structured QUESTION/ANSWER/CITATION blocks into dicts."""
    questions = []
    for block in re.split(r"\n---+\n?", text):
        block = block.strip()
        if not block:
            continue

        q_match = re.search(r"QUESTION:\s*(.+?)(?=\nANSWER:)", block, re.DOTALL)
        a_match = re.search(r"ANSWER:\s*(.+?)(?=\nCITATION:)", block, re.DOTALL)
        c_match = re.search(r"CITATION:\s*(.+)", block, re.DOTALL)

        if q_match and a_match and c_match:
            questions.append({
                "question": q_match.group(1).strip(),
                "answer": a_match.group(1).strip(),
                "citation": c_match.group(1).strip(),
            })

    return questions


def generate_questions_for_course(db, course_id: str) -> int:
    """
    Generates 5 questions for each concept in the course using Groq.
    Fetches the top 3 linked slide chunks per concept as context.
    Inserts all questions into the questions table.
    Returns the total number of questions stored.
    """
    client = _get_client()

    concepts = (
        db.table("concepts")
        .select("id, name, exam_weight")
        .eq("course_id", course_id)
        .order("exam_weight", desc=True)
        .execute()
        .data
    )

    if not concepts:
        print("[questions] No concepts found — skipping question generation")
        return 0

    total_stored = 0

    for i, concept in enumerate(concepts):
        concept_id = concept["id"]
        concept_name = concept["name"]
        exam_weight = concept["exam_weight"]

        # Fetch top 3 slide chunks linked to this concept
        links = (
            db.table("concept_chunks")
            .select("chunk_id")
            .eq("concept_id", concept_id)
            .limit(3)
            .execute()
            .data
        )
        chunk_ids = [l["chunk_id"] for l in links]

        chunks: list[dict] = []
        if chunk_ids:
            chunks = (
                db.table("chunks")
                .select("content, source_file, page_or_slide_number")
                .in_("id", chunk_ids)
                .eq("source_type", "slide")
                .limit(3)
                .execute()
                .data
            )

        if not chunks:
            print(f"[questions] No slide chunks for '{concept_name}' — skipping")
            continue

        try:
            raw = _generate_questions(client, concept_name, exam_weight, chunks)
            questions = _parse_response(raw)
        except Exception as e:
            print(f"[questions] ERROR generating for '{concept_name}': {e}")
            if i < len(concepts) - 1:
                time.sleep(1)
            continue

        rows = [
            {
                "concept_id": concept_id,
                "question": q["question"],
                "answer": q["answer"],
                "citation": q["citation"],
            }
            for q in questions
            if q.get("question") and q.get("answer")
        ]

        if rows:
            db.table("questions").insert(rows).execute()
            total_stored += len(rows)
            print(f"[questions] '{concept_name}' — stored {len(rows)} questions")

        # 1 second delay between calls
        if i < len(concepts) - 1:
            time.sleep(1)

    return total_stored
