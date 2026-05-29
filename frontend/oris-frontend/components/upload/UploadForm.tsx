// Upload form — drag-and-drop file selection with per-file type toggle and post-upload status polling.
'use client'

import { useState, useRef, useEffect, DragEvent } from 'react'
import Link from 'next/link'

interface FileEntry {
  file: File
  sourceType: 'slide' | 'practice'
}

type PollStatus = 'idle' | 'uploading' | 'processing' | 'ready' | 'ready_slides_only' | 'error' | 'timeout'

const POLL_INTERVAL_MS = 3_000
const POLL_TIMEOUT_MS = 5 * 60 * 1_000  // 5 minutes

interface Props {
  userId: string
  // When provided, called immediately after upload succeeds — parent handles the processing state.
  onSuccess?: (courseId: string, courseName: string) => void
}

export default function UploadForm({ userId, onSuccess }: Props) {
  const [courseName, setCourseName] = useState('')
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [dragging, setDragging] = useState(false)
  const [status, setStatus] = useState<PollStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [courseId, setCourseId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollStartRef = useRef<number>(0)

  // Start polling once we have a courseId and status is 'processing'
  useEffect(() => {
    if (status !== 'processing' || !courseId) return

    pollStartRef.current = Date.now()

    pollRef.current = setInterval(async () => {
      // Stop after 5 minutes
      if (Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) {
        clearInterval(pollRef.current!)
        setStatus('timeout')
        return
      }

      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/courses/${courseId}`)
        if (!res.ok) return
        const data = await res.json()

        if (data.status === 'ready' || data.status === 'ready_slides_only') {
          clearInterval(pollRef.current!)
          setStatus(data.status)
        } else if (data.status === 'error') {
          clearInterval(pollRef.current!)
          setStatus('error')
          setErrorMsg('Processing failed — please try uploading again.')
        }
        // If still 'processing', do nothing and poll again
      } catch {
        // Network hiccup — keep polling
      }
    }, POLL_INTERVAL_MS)

    return () => clearInterval(pollRef.current!)
  }, [status, courseId])

  function addFiles(incoming: FileList | null) {
    if (!incoming) return
    const allowed = Array.from(incoming).filter(
      (f) => f.name.endsWith('.pptx') || f.name.endsWith('.pdf')
    )
    setEntries((prev) => {
      const existing = new Set(prev.map((e) => e.file.name))
      const fresh = allowed
        .filter((f) => !existing.has(f.name))
        .map((f) => ({ file: f, sourceType: 'slide' as const }))
      return [...prev, ...fresh]
    })
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }

  function removeEntry(name: string) {
    setEntries((prev) => prev.filter((e) => e.file.name !== name))
  }

  function toggleSourceType(name: string) {
    setEntries((prev) =>
      prev.map((e) =>
        e.file.name === name
          ? { ...e, sourceType: e.sourceType === 'slide' ? 'practice' : 'slide' }
          : e
      )
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!courseName.trim() || entries.length === 0) return

    setStatus('uploading')
    setErrorMsg('')

    const body = new FormData()
    body.append('course_name', courseName.trim())
    body.append('user_id', userId)
    entries.forEach((entry) => {
      body.append('files', entry.file)
      body.append('source_types', entry.sourceType)
    })

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/upload`, {
        method: 'POST',
        body,
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || 'Upload failed')
      }
      const data = await res.json()
      if (onSuccess) {
        // Parent handles the processing state — just hand off the course info.
        onSuccess(data.course_id, courseName.trim())
        setEntries([])
        setCourseName('')
        setStatus('idle')
      } else {
        setCourseId(data.course_id)
        setEntries([])
        setCourseName('')
        setStatus('processing')
      }
    } catch (err: unknown) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  function reset() {
    setStatus('idle')
    setCourseId(null)
    setErrorMsg('')
  }

  return (
    <div className="flex flex-col gap-5 w-full max-w-lg">
      {/* Post-upload states */}
      {status === 'processing' && (
        <div className="rounded-xl border border-zinc-200 bg-white px-6 py-8 text-center">
          <p className="text-sm font-medium text-zinc-700">Processing your course…</p>
          <p className="mt-1 text-xs text-zinc-400">Extracting concepts and building your knowledge graph. This takes about 30–60 seconds.</p>
          <div className="mt-4 flex justify-center">
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
          </div>
        </div>
      )}

      {(status === 'ready' || status === 'ready_slides_only') && courseId && (
        <div className="rounded-xl border border-zinc-200 bg-white px-6 py-8 text-center flex flex-col items-center gap-4">
          {status === 'ready_slides_only' && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-md px-3 py-1.5">
              Study plan based on slides only — add practice materials for better accuracy.
            </p>
          )}
          <p className="text-sm font-medium text-zinc-700">Your course is ready.</p>
          <Link
            href={`/course/${courseId}`}
            className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700"
          >
            View your knowledge graph
          </Link>
          <button onClick={reset} className="text-xs text-zinc-400 hover:text-zinc-600">
            Upload another course
          </button>
        </div>
      )}

      {status === 'timeout' && (
        <div className="rounded-xl border border-zinc-200 bg-white px-6 py-8 text-center flex flex-col items-center gap-3">
          <p className="text-sm font-medium text-zinc-700">This is taking longer than expected.</p>
          <p className="text-xs text-zinc-400">Check back in a few minutes — your course may still be processing.</p>
          <button onClick={reset} className="text-xs text-zinc-400 hover:text-zinc-600">Try uploading again</button>
        </div>
      )}

      {status === 'error' && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-6 py-5 text-center flex flex-col items-center gap-3">
          <p className="text-sm text-red-600">{errorMsg}</p>
          <button onClick={reset} className="text-xs text-red-400 hover:text-red-600">Try again</button>
        </div>
      )}

      {/* Upload form — only shown when idle or uploading */}
      {(status === 'idle' || status === 'uploading') && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Course name</label>
            <input
              type="text"
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              placeholder="e.g. CS 161 — Computer Security"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300"
              required
            />
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 cursor-pointer transition
              ${dragging ? 'border-zinc-400 bg-zinc-100' : 'border-zinc-200 bg-zinc-50 hover:bg-zinc-100'}`}
          >
            <p className="text-sm font-medium text-zinc-600">Drop files here or click to select</p>
            <p className="text-xs text-zinc-400">PPTX and PDF only</p>
            <input
              ref={inputRef}
              type="file"
              accept=".pptx,.pdf"
              multiple
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
          </div>

          {entries.length > 0 && (
            <ul className="flex flex-col gap-2">
              {entries.map((entry) => (
                <li key={entry.file.name} className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm">
                  <span className="flex-1 text-zinc-700 truncate">{entry.file.name}</span>
                  <div className="flex shrink-0 rounded-md border border-zinc-200 overflow-hidden text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => entry.sourceType !== 'slide' && toggleSourceType(entry.file.name)}
                      className={`px-2.5 py-1 transition ${entry.sourceType === 'slide' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}
                    >
                      Slides
                    </button>
                    <button
                      type="button"
                      onClick={() => entry.sourceType !== 'practice' && toggleSourceType(entry.file.name)}
                      className={`px-2.5 py-1 transition ${entry.sourceType === 'practice' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}
                    >
                      Practice
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeEntry(entry.file.name)}
                    className="text-zinc-400 hover:text-zinc-700 shrink-0"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="submit"
            disabled={status === 'uploading' || !courseName.trim() || entries.length === 0}
            className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-40"
          >
            {status === 'uploading' ? 'Uploading…' : 'Upload materials'}
          </button>
        </form>
      )}
    </div>
  )
}
