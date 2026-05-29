// Dashboard — two-column layout: course list on the left, upload form on the right.
'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import UploadForm from '@/components/upload/UploadForm'

interface Course {
  id: string
  name: string
  created_at: string
  status: string
  concept_count: number
}

interface Props {
  userId: string
  initialCourses: Course[]
}

const POLL_INTERVAL_MS = 3_000

function StatusBadge({ status }: { status: string }) {
  if (status === 'processing') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-amber-600">
        <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-amber-300 border-t-amber-600" />
        Processing
      </span>
    )
  }
  if (status === 'ready') return <span className="flex items-center gap-1.5 text-xs text-green-600"><span className="h-2 w-2 rounded-full bg-green-500 inline-block" />Ready</span>
  if (status === 'ready_slides_only') return <span className="flex items-center gap-1.5 text-xs text-amber-600"><span className="h-2 w-2 rounded-full bg-amber-400 inline-block" />Slides only</span>
  if (status === 'needs_upload') return <span className="text-xs text-zinc-400">No materials</span>
  if (status === 'error') return <span className="flex items-center gap-1.5 text-xs text-red-500"><span className="h-2 w-2 rounded-full bg-red-400 inline-block" />Error</span>
  return <span className="text-xs text-zinc-400">{status}</span>
}

export default function CourseList({ userId, initialCourses }: Props) {
  const [courses, setCourses] = useState<Course[]>(initialCourses)
  const [deleting, setDeleting] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const processingIds = courses.filter((c) => c.status === 'processing').map((c) => c.id)

  useEffect(() => {
    if (processingIds.length === 0) {
      clearInterval(pollRef.current!)
      return
    }

    pollRef.current = setInterval(async () => {
      const updates = await Promise.all(
        processingIds.map((id) =>
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/courses/${id}`)
            .then((r) => r.ok ? r.json() : null)
            .catch(() => null)
        )
      )
      setCourses((prev) =>
        prev.map((course) => {
          const update = updates.find((u) => u?.id === course.id)
          if (!update) return course
          return { ...course, status: update.status, concept_count: update.concept_count ?? course.concept_count }
        })
      )
    }, POLL_INTERVAL_MS)

    return () => clearInterval(pollRef.current!)
  }, [processingIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDelete(courseId: string, courseName: string) {
    if (!confirm(`Delete "${courseName}"? This will permanently remove all materials, concepts, and graph data.`)) return
    setDeleting(courseId)
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/courses/${courseId}`, { method: 'DELETE' })
    setCourses((prev) => prev.filter((c) => c.id !== courseId))
    setDeleting(null)
  }

  function handleUploadSuccess(courseId: string, courseName: string) {
    setCourses((prev) => [
      { id: courseId, name: courseName, created_at: new Date().toISOString(), status: 'processing', concept_count: 0 },
      ...prev,
    ])
  }

  return (
    <div className="flex gap-10 w-full max-w-6xl items-start">

      {/* Left: course list */}
      <div className="flex flex-1 flex-col gap-4 min-w-0">
        <h2 className="text-xl font-semibold text-zinc-900">Your courses</h2>

        {courses.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-200 bg-white px-8 py-16 text-center">
            <p className="text-sm font-medium text-zinc-700">No courses yet</p>
            <p className="mt-1 text-sm text-zinc-400">Upload your first course materials to get started.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {courses.map((course) => (
              <li key={course.id} className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-6 py-5">
                <div className="flex flex-col gap-1.5 min-w-0">
                  <span className="text-sm font-semibold text-zinc-900 truncate">{course.name}</span>
                  <div className="flex items-center gap-3 flex-wrap">
                    <StatusBadge status={course.status} />
                    <span className="text-xs text-zinc-300">·</span>
                    <span className="text-xs text-zinc-400">
                      {course.concept_count > 0 ? `${course.concept_count} concepts` : 'No concepts yet'}
                    </span>
                    <span className="text-xs text-zinc-300">·</span>
                    <span className="text-xs text-zinc-400">
                      {new Date(course.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                </div>
                <div className="ml-4 flex shrink-0 items-center gap-2">
                  <Link
                    href={`/course/${course.id}`}
                    className={`rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50
                      ${course.status === 'processing' ? 'pointer-events-none opacity-40' : ''}`}
                  >
                    Open graph
                  </Link>
                  <button
                    onClick={() => handleDelete(course.id, course.name)}
                    disabled={deleting === course.id}
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-400 transition hover:border-red-200 hover:text-red-500 disabled:opacity-40"
                    title="Delete course"
                  >
                    {deleting === course.id ? '…' : '✕'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Right: upload form */}
      <div className="w-[420px] shrink-0 rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-base font-semibold text-zinc-900 mb-5">Add new course</h2>
        <UploadForm userId={userId} onSuccess={handleUploadSuccess} />
      </div>

    </div>
  )
}
