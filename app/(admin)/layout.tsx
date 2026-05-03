
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSessionProfile } from '@/app/contexts/SessionContext'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { profile, loading } = useSessionProfile()
  const router = useRouter()

  useEffect(() => {
    if (loading) return

    if (!profile || profile.role === 'Viewer') {
      router.replace('/') // ✅ redirection propre
    }
  }, [profile, loading, router])

  // ✅ Ne JAMAIS retourner null pendant loading
  if (loading) {
    return <p style={{ padding: 40 }}>Loading session…</p>
  }

  // ✅ Cas non autorisé (court instant avant redirect)
  if (!profile || profile.role === 'Viewer') {
    return <p style={{ padding: 40 }}>Redirecting…</p>
  }

  // ✅ Admin / Editor autorisés
  return <>{children}</>
}
