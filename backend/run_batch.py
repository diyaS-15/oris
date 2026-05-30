# One-off script to run batch question generation for a course.
from dotenv import load_dotenv
load_dotenv(dotenv_path=".env")

from db.supabase import get_client
from services.questions.question_generator import generate_questions_for_course

COURSE_ID = "2f1f0e9a-56ef-45f3-ac6e-571a94899a34"

db = get_client()

concepts = (
    db.table("concepts")
    .select("name")
    .eq("course_id", COURSE_ID)
    .order("exam_weight", desc=True)
    .execute()
    .data
)
print(f"Starting batch generation for {len(concepts)} concepts\n")
for c in concepts:
    print(f"  → {c['name']}")
print()

total = generate_questions_for_course(db, COURSE_ID)
print(f"\nDone — {total} questions stored total")
