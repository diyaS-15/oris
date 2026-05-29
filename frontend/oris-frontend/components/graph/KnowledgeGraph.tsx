// Knowledge graph visualizer — renders concepts as nodes sized by exam_weight, edges by similarity.
// Cytoscape uses browser APIs so it is dynamically imported with ssr: false.
'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
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

interface Props {
  concepts: Concept[]
  edges: Edge[]
  slidesOnly: boolean
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

export default function KnowledgeGraph({ concepts, edges, slidesOnly }: Props) {
  const [selected, setSelected] = useState<Concept | null>(null)

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
        <div className="absolute right-4 top-4 w-64 rounded-xl border border-zinc-200 bg-white shadow-md p-5 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
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

          <div>
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

          {selected.reviewed && (
            <p className="text-xs text-zinc-400 italic">Marked as reviewed</p>
          )}
        </div>
      )}
    </div>
  )
}
