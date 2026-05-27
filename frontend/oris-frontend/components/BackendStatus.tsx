// Client component that pings the FastAPI health endpoint and shows its status.
'use client'

import { useEffect, useState } from 'react'

export default function BackendStatus() {
  const [status, setStatus] = useState<'checking' | 'ok' | 'unreachable'>('checking')

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/health`)
      .then((res) => res.ok ? setStatus('ok') : setStatus('unreachable'))
      .catch(() => setStatus('unreachable'))
  }, [])

  const label = status === 'checking' ? 'Checking backend…' : status === 'ok' ? 'Backend reachable' : 'Backend unreachable'
  const color = status === 'ok' ? 'text-green-600' : status === 'unreachable' ? 'text-red-500' : 'text-zinc-400'

  return <p className={`text-sm ${color}`}>{label}</p>
}
