
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSessionProfile } from '@/contexts/SessionContext'

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
    return <p style={{ 
    paddingTop: 80,
    paddingLeft: 10,
    paddingRight: 10,
    paddingBottom: 10,
 }}>Loading…</p>
  }

  return <>{children}</>
}