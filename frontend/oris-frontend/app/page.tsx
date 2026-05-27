// Root route — redirects authenticated users to the dashboard; unauthenticated users are caught by middleware and sent to /login first.
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/dashboard')
}
