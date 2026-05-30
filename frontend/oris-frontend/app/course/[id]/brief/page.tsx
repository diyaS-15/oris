// Exam brief — top 10 concepts by exam weight, each with cited sources and practice questions.
import { notFound } from 'next/navigation'
import Link from 'next/link'

interface Source {
  source_file: string
  source_type: string
  page_or_slide_number: number
}

interface Question {
  id: string
  question: string
  answer: string
  citation: string
}

interface BriefConcept {
  id: string
  name: string
  exam_weight: number
  reviewed: boolean
  sources: Source[]
  questions: Question[]
}

interface Props {
  params: Promise<{ id: string }>
}

async function getBrief(courseId: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/v1/courses/${courseId}/brief`,
    { cache: 'no-store' }
  )
  if (res.status === 404) return null
  if (!res.ok) throw new Error('Failed to load brief')
  return res.json()
}

export default async function BriefPage({ params }: Props) {
  const { id } = await params
  const data = await getBrief(id)
  if (!data) notFound()

  const { course, concepts }: { course: { name: string }, concepts: BriefConcept[] } = data

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/course/${id}`} className="text-sm text-zinc-400 hover:text-zinc-600">
            ← Graph
          </Link>
          <span className="text-zinc-200">|</span>
          <span className="text-sm font-medium text-zinc-900">{course.name}</span>
          <span className="text-zinc-200">|</span>
          <span className="text-sm text-zinc-500">Exam Brief</span>
        </div>
        <span className="text-xs text-zinc-400">Top {concepts.length} concepts by exam weight</span>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 flex flex-col gap-6">
        {concepts.map((concept, index) => (
          <div key={concept.id} className="rounded-xl border border-zinc-200 bg-white p-6 flex flex-col gap-4">

            {/* Concept header */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xs font-mono text-zinc-400 shrink-0">#{index + 1}</span>
                <h2 className="text-sm font-semibold text-zinc-900 capitalize">{concept.name}</h2>
                {concept.reviewed && (
                  <span className="text-xs text-zinc-400 border border-zinc-200 rounded-full px-2 py-0.5 shrink-0">
                    Reviewed
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="w-20 h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-zinc-900"
                    style={{ width: `${Math.round(concept.exam_weight * 100)}%` }}
                  />
                </div>
                <span className="text-xs text-zinc-500 tabular-nums">
                  {Math.round(concept.exam_weight * 100)}%
                </span>
              </div>
            </div>

            {/* Sources */}
            {concept.sources.length > 0 && (
              <div>
                <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1.5">Sources</p>
                <div className="flex flex-wrap gap-2">
                  {concept.sources.map((s, i) => (
                    <span key={i} className="text-xs bg-zinc-50 border border-zinc-100 rounded px-2 py-1 text-zinc-500">
                      {s.source_file}, {s.source_type === 'slide' ? 'slide' : 'page'} {s.page_or_slide_number}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Questions */}
            {concept.questions.length > 0 && (
              <div>
                <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">Practice questions</p>
                <div className="flex flex-col gap-3">
                  {concept.questions.map((q) => (
                    <div key={q.id} className="rounded-lg bg-zinc-50 border border-zinc-100 px-4 py-3 flex flex-col gap-1.5">
                      <p className="text-xs font-medium text-zinc-700">{q.question}</p>
                      <p className="text-xs text-zinc-500 leading-relaxed">{q.answer}</p>
                      <p className="text-xs text-zinc-400 italic">{q.citation}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        ))}
      </main>
    </div>
  )
}
