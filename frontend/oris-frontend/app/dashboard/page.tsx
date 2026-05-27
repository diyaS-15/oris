// Dashboard page — shown after login, displays the user's email and a sign-out button.
import { getServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SignOutButton from '@/components/auth/SignOutButton'
import BackendStatus from '@/components/BackendStatus'
import UploadForm from '@/components/upload/UploadForm'

export default async function DashboardPage() {
  const supabase = await getServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-8 py-4">
        <span className="text-lg font-semibold tracking-tight text-zinc-900">Oris</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-zinc-500">{user.email}</span>
          <SignOutButton />
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-8">
        <h2 className="text-2xl font-semibold text-zinc-900">Upload course materials</h2>
        <UploadForm userId={user.id} />
        <BackendStatus />
      </main>
    </div>
  )
}
