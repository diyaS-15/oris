// Course page — shows the knowledge graph and the materials panel side by side.
import { notFound } from 'next/navigation'
import Link from 'next/link'
import KnowledgeGraph from '@/components/graph/KnowledgeGraph'
import CourseFilesPanel from '@/components/graph/CourseFilesPanel'

interface Props {
  params: Promise<{ id: string }>
}

async function getCourse(courseId: string) {
  const [graphRes, filesRes] = await Promise.all([
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/courses/${courseId}/graph`, { cache: 'no-store' }),
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/courses/${courseId}/files`, { cache: 'no-store' }),
  ])
  if (graphRes.status === 404) return null
  if (!graphRes.ok) throw new Error('Failed to load course')
  const graph = await graphRes.json()
  const files = filesRes.ok ? await filesRes.json() : []
  return { graph, files }
}

export default async function CoursePage({ params }: Props) {
  const { id } = await params
  const data = await getCourse(id)

  if (!data) notFound()

  const { graph: { course, concepts, edges }, files } = data
  const slidesOnly = course.status === 'ready_slides_only'
  const needsUpload = course.status === 'needs_upload'

  return (
    <div className="flex flex-col h-screen bg-zinc-50">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3 shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-sm text-zinc-400 hover:text-zinc-600">
            ← Dashboard
          </Link>
          <span className="text-zinc-200">|</span>
          <span className="text-sm font-medium text-zinc-900">{course.name}</span>
        </div>
        <span className="text-xs text-zinc-400">{concepts.length} concepts</span>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Graph area */}
        <div className="flex-1 relative">
          {needsUpload ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center px-8">
              <p className="text-sm font-medium text-zinc-700">No materials uploaded.</p>
              <p className="text-xs text-zinc-400">Use the panel on the right to add files.</p>
            </div>
          ) : (
            <KnowledgeGraph concepts={concepts} edges={edges} slidesOnly={slidesOnly} courseId={id} />
          )}
        </div>

        {/* Materials panel */}
        <CourseFilesPanel
          courseId={id}
          initialFiles={files}
          initialStatus={course.status}
        />
      </div>
    </div>
  )
}
