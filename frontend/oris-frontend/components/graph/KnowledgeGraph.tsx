// Knowledge graph visualizer — renders concepts as nodes sized by exam_weight, edges by similarity.
// Cytoscape uses browser APIs so it is dynamically imported with ssr: false.
'use client'

import dynamic from 'next/dynamic'
import { useState, useEffect } from 'react'
import type { Core, ElementDefinition, StylesheetStyle } from 'cytoscape'

const CytoscapeComponent = dynamic(() => import('react-cytoscapejs'), { ssr: false })

interface Concept {
  id: string
  name: string
  exam_weight: number
  reviewed: boolean
}

interface Edge {
  id: string
  source_concept_id: string
  target_concept_id: string
  edge_type: string
  weight: number
}

interface Question {
  id: string
  question: string
  answer: string
  citation: string
}

interface Source {
  source_file: string
  source_type: string
  page_or_slide_number: number
}

interface Props {
  concepts: Concept[]
  edges: Edge[]
  slidesOnly: boolean
  courseId: string
}

const STYLESHEET: StylesheetStyle[] = [
  {
    selector: 'node',
    style: {
      label: 'data(label)',
      width: 'mapData(examWeight, 0, 1, 70, 150)',
      height: 'mapData(examWeight, 0, 1, 70, 150)',
      'background-color': '#18181b',
      color: '#ffffff',
      'font-size': 10,
      'text-valign': 'center',
      'text-halign': 'center',
      'text-wrap': 'wrap',
      'text-max-width': '62px',
    },
  },
  {
    selector: 'node.reviewed',
    style: {
      'background-color': '#a1a1aa',
    },
  },
  {
    selector: 'node.selected',
    style: {
      'background-color': '#2563eb',
      'border-width': 2,
      'border-color': '#93c5fd',
    },
  },
  {
    selector: 'edge',
    style: {
      width: 'mapData(weight, 0, 1, 0.5, 2.5)',
      'line-color': '#d4d4d8',
      'curve-style': 'bezier',
      opacity: 0.7,
    },
  },
]

function getNextConcept(concepts: Concept[], edges: Edge[], selectedId: string): Concept | null {
  const unreviewed = concepts.filter((c) => !c.reviewed && c.id !== selectedId)
  if (unreviewed.length === 0) return null

  const neighborIds = new Set(
    edges
      .filter((e) => e.source_concept_id === selectedId || e.target_concept_id === selectedId)
      .map((e) => e.source_concept_id === selectedId ? e.target_concept_id : e.source_concept_id)
  )

  const unreviewedNeighbors = unreviewed.filter((c) => neighborIds.has(c.id))
  const pool = unreviewedNeighbors.length > 0 ? unreviewedNeighbors : unreviewed
  return pool.reduce((best, c) => c.exam_weight > best.exam_weight ? c : best)
}

export default function KnowledgeGraph({ concepts: initialConcepts, edges, slidesOnly, courseId }: Props) {
  const [concepts, setConcepts] = useState<Concept[]>(initialConcepts)
  const [selected, setSelected] = useState<Concept | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null)
  const [reviewLoading, setReviewLoading] = useState(false)

  useEffect(() => {
    if (!selected) {
      setQuestions([])
      setSources([])
      setExpandedQuestion(null)
      return
    }
    setLoading(true)
    setQuestions([])
    setSources([])
    setExpandedQuestion(null)

    const base = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/courses/${courseId}/concepts/${selected.id}`
    Promise.all([
      fetch(`${base}/questions`).then((r) => r.ok ? r.json() : []),
      fetch(`${base}/sources`).then((r) => r.ok ? r.json() : []),
    ])
      .then(([qs, srcs]) => {
        setQuestions(qs)
        // Deduplicate sources by file + page (slide links may duplicate practice links)
        const seen = new Set<string>()
        const deduped = (srcs as Source[]).filter((s) => {
          const key = `${s.source_file}:${s.page_or_slide_number}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        setSources(deduped)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [selected?.id])

  const elements: ElementDefinition[] = [
    ...concepts.map((c) => ({
      data: {
        id: c.id,
        label: c.name,
        examWeight: c.exam_weight,
      },
      classes: [
        c.reviewed ? 'reviewed' : '',
        selected?.id === c.id ? 'selected' : '',
      ]
        .filter(Boolean)
        .join(' '),
    })),
    ...edges.map((e) => ({
      data: {
        id: e.id,
        source: e.source_concept_id,
        target: e.target_concept_id,
        weight: e.weight,
      },
    })),
  ]

  async function toggleReviewed() {
    if (!selected || reviewLoading) return
    setReviewLoading(true)
    const newValue = !selected.reviewed
    try {
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/courses/${courseId}/concepts/${selected.id}`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reviewed: newValue }) }
      )
      const updated = { ...selected, reviewed: newValue }
      setSelected(updated)
      setConcepts((prev) => prev.map((c) => c.id === selected.id ? updated : c))
    } finally {
      setReviewLoading(false)
    }
  }

  function onCyInit(cy: Core) {
    cy.on('tap', 'node', (evt) => {
      const nodeId = evt.target.id()
      const concept = concepts.find((c) => c.id === nodeId) ?? null
      setSelected(concept)
    })
    cy.on('tap', (evt) => {
      if (evt.target === cy) setSelected(null)
    })
  }

  return (
    <div className="relative flex h-full w-full">
      {slidesOnly && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 rounded-full bg-amber-50 border border-amber-200 px-4 py-1.5 text-xs text-amber-700">
          Study plan based on slides only — add practice materials for better accuracy
        </div>
      )}

      <CytoscapeComponent
        elements={elements}
        stylesheet={STYLESHEET}
        layout={{ name: 'cose', animate: false, padding: 40 }}
        style={{ width: '100%', height: '100%' }}
        cy={onCyInit}
      />

      {/* Concept card panel */}
      {selected && (
        <div className="absolute right-4 top-4 w-72 rounded-xl border border-zinc-200 bg-white shadow-md flex flex-col max-h-[calc(100%-2rem)] overflow-hidden">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 p-5 pb-3">
            <h3 className="text-sm font-semibold text-zinc-900 leading-snug capitalize">
              {selected.name}
            </h3>
            <button
              onClick={() => setSelected(null)}
              className="text-zinc-400 hover:text-zinc-600 shrink-0 text-xs mt-0.5"
            >
              ✕
            </button>
          </div>

          {/* Exam weight */}
          <div className="px-5 pb-3">
            <p className="text-xs text-zinc-500 mb-1">Exam weight</p>
            <div className="h-2 w-full rounded-full bg-zinc-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-zinc-900 transition-all"
                style={{ width: `${Math.round(selected.exam_weight * 100)}%` }}
              />
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              {Math.round(selected.exam_weight * 100)}% frequency in practice materials
            </p>
          </div>

          {/* Mark as reviewed button */}
          <div className="px-5 pb-3">
            <button
              onClick={toggleReviewed}
              disabled={reviewLoading}
              className={`w-full rounded-lg border px-3 py-2 text-xs font-medium transition disabled:opacity-40 ${
                selected.reviewed
                  ? 'border-zinc-200 bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              {reviewLoading ? '...' : selected.reviewed ? 'Reviewed ✓' : 'Mark as reviewed'}
            </button>
          </div>

          {/* Divider */}
          <div className="border-t border-zinc-100 mx-5" />

          {/* Study next suggestion */}
          {(() => {
            const next = getNextConcept(concepts, edges, selected.id)
            if (!next) return null
            return (
              <div className="px-5 pb-3">
                <p className="text-xs text-zinc-400 mb-1.5">Study next</p>
                <button
                  onClick={() => setSelected(next)}
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-100 transition capitalize"
                >
                  {next.name}
                  <span className="ml-2 text-zinc-400 font-normal">
                    {Math.round(next.exam_weight * 100)}%
                  </span>
                </button>
              </div>
            )
          })()}

          <div className="flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-4">
            {loading && <p className="text-xs text-zinc-400">Loading...</p>}

            {/* Sources */}
            {!loading && sources.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Sources</p>
                {sources.map((s, i) => (
                  <p key={i} className="text-xs text-zinc-500">
                    {s.source_file}
                    <span className="text-zinc-400">, {s.source_type === 'slide' ? 'slide' : 'page'} {s.page_or_slide_number}</span>
                  </p>
                ))}
              </div>
            )}

            {/* Practice questions */}
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
                Practice questions
              </p>

              {!loading && questions.length === 0 && (
                <p className="text-xs text-zinc-400">No questions generated for this concept.</p>
              )}

              {questions.map((q) => (
                <div key={q.id} className="rounded-lg border border-zinc-100 bg-zinc-50 overflow-hidden">
                  <button
                    className="w-full text-left px-3 py-2.5 text-xs text-zinc-700 font-medium leading-snug"
                    onClick={() => setExpandedQuestion(expandedQuestion === q.id ? null : q.id)}
                  >
                    {q.question}
                  </button>
                  {expandedQuestion === q.id && (
                    <div className="border-t border-zinc-100 px-3 py-2.5 flex flex-col gap-1.5">
                      <p className="text-xs text-zinc-600 leading-relaxed">{q.answer}</p>
                      <p className="text-xs text-zinc-400 italic">{q.citation}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
