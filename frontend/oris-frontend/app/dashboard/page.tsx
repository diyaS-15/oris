// Dashboard page — lists all courses for the logged-in user and hosts the add-course flow.
import { getServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SignOutButton from '@/components/auth/SignOutButton'
import CourseList from '@/components/dashboard/CourseList'

export default async function DashboardPage() {
  const supabase = await getServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Fetch all courses for this user, newest first
  const { data: courses } = await supabase
    .from('courses')
    .select('id, name, created_at, status')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  // Fetch concept counts in parallel
  const coursesWithCounts = await Promise.all(
    (courses ?? []).map(async (course) => {
      const { count } = await supabase
        .from('concepts')
        .select('*', { count: 'exact', head: true })
        .eq('course_id', course.id)
      return { ...course, concept_count: count ?? 0 }
    })
  )

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-8 py-4">
        <span className="text-lg font-semibold tracking-tight text-zinc-900">Oris</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-zinc-500">{user.email}</span>
          <SignOutButton />
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center px-8 py-10">
        <CourseList userId={user.id} initialCourses={coursesWithCounts} />
      </main>
    </div>
  )
}
