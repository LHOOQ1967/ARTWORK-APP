
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSessionProfile } from '@/app/contexts/SessionContext'

export default function ArtworkNewLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { role, loading } = useSessionProfile()

  useEffect(() => {
    if (!loading && role && role !== 'Administrator' && role !== 'Editor') {
      router.replace('/artworks')
    }
  }, [role, loading, router])

  if (loading || !role) {
    return <p style={{ padding: 40 }}>Loading…</p>
  }

  return <>{children}</>
}