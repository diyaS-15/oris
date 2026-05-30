// Interactive study plan — prioritized concept list with time estimates and mark-as-reviewed.
'use client'

import { useState } from 'react'

interface Concept {
  id: string
  name: string
  exam_weight: number
  reviewed: boolean
}

interface Props {
  initialConcepts: Concept[]
  courseId: string
}

function timeEstimate(examWeight: number): number {
  if (examWeight >= 0.8) return 20
  if (examWeight >= 0.5) return 15
  if (examWeight >= 0.3) return 10
  return 5
}

export default function StudyPlan({ initialConcepts, courseId }: Props) {
  const [concepts, setConcepts] = useState<Concept[]>(initialConcepts)
  const [toggling, setToggling] = useState<string | null>(null)

  const reviewed = concepts.filter((c) => c.reviewed).length
  const totalMinutes = concepts.filter((c) => !c.reviewed).reduce((sum, c) => sum + timeEstimate(c.exam_weight), 0)

  async function toggleReviewed(concept: Concept) {
    if (toggling) return
    setToggling(concept.id)
    const newValue = !concept.reviewed
    try {
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/courses/${courseId}/concepts/${concept.id}`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reviewed: newValue }) }
      )
      setConcepts((prev) => prev.map((c) => c.id === concept.id ? { ...c, reviewed: newValue } : c))
    } finally {
      setToggling(null)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 flex flex-col gap-6">

      {/* Progress header */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-zinc-900">{reviewed} / {concepts.length} concepts reviewed</p>
            <p className="text-xs text-zinc-400 mt-0.5">
              {totalMinutes > 0 ? `~${totalMinutes} min remaining` : 'All done!'}
            </p>
          </div>
          <span className="text-sm font-medium text-zinc-500 tabular-nums">
            {Math.round((reviewed / concepts.length) * 100)}%
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-zinc-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-zinc-900 transition-all duration-300"
            style={{ width: `${Math.round((reviewed / concepts.length) * 100)}%` }}
          />
        </div>
      </div>

      {/* Concept list */}
      <div className="flex flex-col gap-2">
        {concepts.map((concept, index) => (
          <div
            key={concept.id}
            className={`rounded-xl border bg-white px-5 py-4 flex items-center gap-4 transition ${
              concept.reviewed ? 'border-zinc-100 opacity-50' : 'border-zinc-200'
            }`}
          >
            {/* Rank */}
            <span className="text-xs font-mono text-zinc-300 w-5 shrink-0 text-right">{index + 1}</span>

            {/* Concept info */}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium capitalize leading-snug ${concept.reviewed ? 'line-through text-zinc-400' : 'text-zinc-900'}`}>
                {concept.name}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-16 h-1 rounded-full bg-zinc-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-zinc-400"
                    style={{ width: `${Math.round(concept.exam_weight * 100)}%` }}
                  />
                </div>
                <span className="text-xs text-zinc-400">
                  {Math.round(concept.exam_weight * 100)}% · ~{timeEstimate(concept.exam_weight)} min
                </span>
              </div>
            </div>

            {/* Reviewed toggle */}
            <button
              onClick={() => toggleReviewed(concept)}
              disabled={toggling === concept.id}
              className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-40 ${
                concept.reviewed
                  ? 'border-zinc-200 bg-zinc-100 text-zinc-400 hover:bg-zinc-200'
                  : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              {toggling === concept.id ? '...' : concept.reviewed ? 'Reviewed ✓' : 'Mark done'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
