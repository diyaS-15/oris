// Course materials panel — lists uploaded files with remove/add/clear controls, polls while pipeline reruns.
'use client'

import { useState, useEffect, useRef, DragEvent } from 'react'
import { useRouter } from 'next/navigation'

interface CourseFile {
  id: string
  filename: string
  source_type: 'slide' | 'practice'
  size_bytes: number
  uploaded_at: string
}

interface Props {
  courseId: string
  initialFiles: CourseFile[]
  initialStatus: string
}

const POLL_INTERVAL_MS = 3_000
const POLL_TIMEOUT_MS = 5 * 60 * 1_000

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function CourseFilesPanel({ courseId, initialFiles, initialStatus }: Props) {
  const router = useRouter()
  const [files, setFiles] = useState<CourseFile[]>(initialFiles)
  const [panelStatus, setPanelStatus] = useState<string>(initialStatus)
  const [view, setView] = useState<'list' | 'add'>('list')
  const [removing, setRemoving] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)
  const [error, setError] = useState('')

  // Add-files form state
  const [entries, setEntries] = useState<{ file: File; sourceType: 'slide' | 'practice' }[]>([])
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollStartRef = useRef(0)

  const isProcessing = panelStatus === 'processing'

  // Poll when processing
  useEffect(() => {
    if (!isProcessing) return

    pollStartRef.current = Date.now()
    pollRef.current = setInterval(async () => {
      if (Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) {
        clearInterval(pollRef.current!)
        setPanelStatus('error')
        setError('Processing timed out.')
        return
      }
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/courses/${courseId}`)
        const data = await res.json()
        if (data.status === 'ready' || data.status === 'ready_slides_only') {
          clearInterval(pollRef.current!)
          setPanelStatus(data.status)
          router.refresh()
        } else if (data.status === 'error') {
          clearInterval(pollRef.current!)
          setPanelStatus('error')
          setError('Pipeline failed — try removing the file and re-uploading.')
        }
      } catch { /* keep polling */ }
    }, POLL_INTERVAL_MS)

    return () => clearInterval(pollRef.current!)
  }, [isProcessing, courseId, router])

  async function handleRemove(filename: string) {
    setRemoving(filename)
    setError('')
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/courses/${courseId}/files?filename=${encodeURIComponent(filename)}`,
      { method: 'DELETE' }
    )
    const data = await res.json()
    setFiles((prev) => prev.filter((f) => f.filename !== filename))
    setRemoving(null)
    setPanelStatus(data.status)
  }

  async function handleClearAll() {
    setClearing(true)
    setError('')
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/courses/${courseId}/materials`, { method: 'DELETE' })
    setFiles([])
    setClearing(false)
    setPanelStatus('needs_upload')
    setView('add')
    router.refresh()
  }

  // Add-files form handlers
  function addEntries(incoming: FileList | null) {
    if (!incoming) return
    const allowed = Array.from(incoming).filter((f) => f.name.endsWith('.pptx') || f.name.endsWith('.pdf'))
    setEntries((prev) => {
      const existing = new Set(prev.map((e) => `${e.file.name}:${e.file.size}`))
      const fresh = allowed
        .filter((f) => !existing.has(`${f.name}:${f.size}`))
        .map((f) => ({ file: f, sourceType: 'slide' as const }))
      return [...prev, ...fresh]
    })
  }

  function toggleType(name: string) {
    setEntries((prev) =>
      prev.map((e) =>
        e.file.name === name ? { ...e, sourceType: e.sourceType === 'slide' ? 'practice' : 'slide' } : e
      )
    )
  }

  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (entries.length === 0) return
    setUploading(true)
    setUploadError('')

    const body = new FormData()
    entries.forEach((entry) => {
      body.append('files', entry.file)
      body.append('source_types', entry.sourceType)
    })

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/courses/${courseId}/files`, {
      method: 'POST',
      body,
    })

    if (!res.ok) {
      const data = await res.json()
      setUploadError(data.detail || 'Upload failed')
      setUploading(false)
      return
    }

    // Refresh file list
    const filesRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/courses/${courseId}/files`)
    const updatedFiles = await filesRes.json()
    setFiles(updatedFiles)
    setEntries([])
    setUploading(false)
    setView('list')
    setPanelStatus('processing')
  }

  return (
    <div className="flex flex-col h-full border-l border-zinc-200 bg-white w-72 shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
        <span className="text-xs font-semibold text-zinc-700 uppercase tracking-wide">Materials</span>
        <div className="flex gap-2">
          {view === 'list' && (
            <button onClick={() => setView('add')} className="text-xs text-zinc-500 hover:text-zinc-800">
              + Add
            </button>
          )}
          {view === 'add' && (
            <button onClick={() => setView('list')} className="text-xs text-zinc-500 hover:text-zinc-800">
              ← Back
            </button>
          )}
        </div>
      </div>

      {isProcessing && (
        <div className="flex items-center gap-2 px-4 py-3 bg-zinc-50 border-b border-zinc-100">
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700 shrink-0" />
          <span className="text-xs text-zinc-500">Rebuilding knowledge graph…</span>
        </div>
      )}

      {error && (
        <p className="px-4 py-2 text-xs text-red-500 bg-red-50 border-b border-red-100">{error}</p>
      )}

      {/* File list view */}
      {view === 'list' && (
        <div className="flex flex-col flex-1 overflow-y-auto">
          {files.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
              <p className="text-xs text-zinc-400">No materials uploaded.</p>
              <button onClick={() => setView('add')} className="text-xs text-zinc-600 underline">
                Add files
              </button>
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-zinc-100">
              {files.map((f) => (
                <li key={f.id} className="flex items-start justify-between gap-2 px-4 py-3">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-xs font-medium text-zinc-800 truncate">{f.filename}</span>
                    <span className="text-xs text-zinc-400">
                      {f.source_type === 'practice' ? 'Practice' : 'Slides'} · {formatBytes(f.size_bytes)}
                    </span>
                  </div>
                  <button
                    onClick={() => handleRemove(f.filename)}
                    disabled={removing === f.filename || isProcessing}
                    className="text-zinc-300 hover:text-red-400 transition shrink-0 disabled:opacity-40 mt-0.5"
                    title="Remove file"
                  >
                    {removing === f.filename ? '…' : '✕'}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {files.length > 0 && (
            <div className="mt-auto px-4 py-3 border-t border-zinc-100">
              <button
                onClick={handleClearAll}
                disabled={clearing || isProcessing}
                className="w-full rounded-lg border border-zinc-200 py-2 text-xs text-zinc-500 hover:border-red-200 hover:text-red-500 transition disabled:opacity-40"
              >
                {clearing ? 'Clearing…' : 'Clear all materials'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Add files view */}
      {view === 'add' && (
        <form onSubmit={handleAddSubmit} className="flex flex-col flex-1 gap-3 p-4 overflow-y-auto">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragging(false); addEntries(e.dataTransfer.files) }}
            onClick={() => inputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-8 cursor-pointer transition text-center
              ${dragging ? 'border-zinc-400 bg-zinc-100' : 'border-zinc-200 bg-zinc-50 hover:bg-zinc-100'}`}
          >
            <p className="text-xs font-medium text-zinc-600">Drop files or click</p>
            <p className="text-xs text-zinc-400">PPTX and PDF only</p>
            <input ref={inputRef} type="file" accept=".pptx,.pdf" multiple className="hidden" onChange={(e) => addEntries(e.target.files)} />
          </div>

          {entries.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {entries.map((entry) => (
                <li key={entry.file.name} className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs">
                  <span className="flex-1 truncate text-zinc-700">{entry.file.name}</span>
                  <div className="flex shrink-0 rounded border border-zinc-200 overflow-hidden text-xs font-medium">
                    <button type="button" onClick={() => entry.sourceType !== 'slide' && toggleType(entry.file.name)}
                      className={`px-2 py-0.5 transition ${entry.sourceType === 'slide' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}>
                      Slides
                    </button>
                    <button type="button" onClick={() => entry.sourceType !== 'practice' && toggleType(entry.file.name)}
                      className={`px-2 py-0.5 transition ${entry.sourceType === 'practice' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}>
                      Practice
                    </button>
                  </div>
                  <button type="button" onClick={() => setEntries((p) => p.filter((e) => e.file.name !== entry.file.name))}
                    className="text-zinc-400 hover:text-zinc-700">✕</button>
                </li>
              ))}
            </ul>
          )}

          {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}

          <button type="submit" disabled={uploading || entries.length === 0}
            className="rounded-lg bg-zinc-900 py-2 text-xs font-medium text-white transition hover:bg-zinc-700 disabled:opacity-40">
            {uploading ? 'Uploading…' : 'Add to course'}
          </button>
        </form>
      )}
    </div>
  )
}
