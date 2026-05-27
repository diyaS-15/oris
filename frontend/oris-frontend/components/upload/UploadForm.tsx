// Upload form — drag-and-drop or click to select PPTX/PDF files, then POST them to the backend.
'use client'

import { useState, useRef, DragEvent } from 'react'

interface Props {
  userId: string
}

export default function UploadForm({ userId }: Props) {
  const [courseName, setCourseName] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function addFiles(incoming: FileList | null) {
    if (!incoming) return
    const allowed = Array.from(incoming).filter(
      (f) => f.name.endsWith('.pptx') || f.name.endsWith('.pdf')
    )
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name))
      return [...prev, ...allowed.filter((f) => !names.has(f.name))]
    })
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }

  function removeFile(name: string) {
    setFiles((prev) => prev.filter((f) => f.name !== name))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!courseName.trim() || files.length === 0) return

    setStatus('uploading')
    setErrorMsg('')

    const body = new FormData()
    body.append('course_name', courseName.trim())
    body.append('user_id', userId)
    files.forEach((f) => body.append('files', f))

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/upload`, {
        method: 'POST',
        body,
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || 'Upload failed')
      }
      setStatus('done')
      setFiles([])
      setCourseName('')
    } catch (err: unknown) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 w-full max-w-lg">
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

      {files.length > 0 && (
        <ul className="flex flex-col gap-2">
          {files.map((f) => (
            <li key={f.name} className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm">
              <span className="text-zinc-700 truncate">{f.name}</span>
              <button
                type="button"
                onClick={() => removeFile(f.name)}
                className="ml-3 text-zinc-400 hover:text-zinc-700 shrink-0"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {status === 'done' && (
        <p className="text-sm text-green-600">Upload complete — your course is being processed.</p>
      )}
      {status === 'error' && (
        <p className="text-sm text-red-500">{errorMsg}</p>
      )}

      <button
        type="submit"
        disabled={status === 'uploading' || !courseName.trim() || files.length === 0}
        className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-40"
      >
        {status === 'uploading' ? 'Uploading…' : 'Upload materials'}
      </button>
    </form>
  )
}
