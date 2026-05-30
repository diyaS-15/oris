// Study plan page — shows all concepts prioritized by exam weight with time estimates.
import { notFound } from 'next/navigation'
import Link from 'next/link'
import StudyPlan from '@/components/study/StudyPlan'

interface Props {
  params: Promise<{ id: string }>
}

async function getCourseWithConcepts(courseId: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/v1/courses/${courseId}/graph`,
    { cache: 'no-store' }
  )
  if (res.status === 404) return null
  if (!res.ok) throw new Error('Failed to load course')
  return res.json()
}

export default async function StudyPage({ params }: Props) {
  const { id } = await params
  const data = await getCourseWithConcepts(id)
  if (!data) notFound()

  const { course, concepts } = data
  const sorted = [...concepts].sort((a: { exam_weight: number }, b: { exam_weight: number }) => b.exam_weight - a.exam_weight)

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
          <span className="text-sm text-zinc-500">Study Plan</span>
        </div>
        <Link
          href={`/course/${id}/brief`}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition"
        >
          Exam brief
        </Link>
      </header>

      <StudyPlan initialConcepts={sorted} courseId={id} />
    </div>
  )
}
