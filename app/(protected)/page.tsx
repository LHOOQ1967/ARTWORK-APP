
'use client'

import { useEffect, useState } from 'react'
import ViewerHome from '@/components/home/ViewerHome'
import AdminHome from '@/components/home/AdminHome'
import { useSessionProfile } from '@/contexts/SessionContext'

type Artwork = { id: string; title?: string; artist?: string }

export default function HomePage() {
  const { role, loading } = useSessionProfile()
  const [artworks, setArtworks] = useState<Artwork[]>([])
  const [loadingArtworks, setLoadingArtworks] = useState(false)

  useEffect(() => {
    if (loading) return
    if (role === 'Viewer' || !role) return

    ;(async () => {
      setLoadingArtworks(true)
      try {
        const res = await fetch('/api/artworks', { cache: 'no-store' })
        const data = await res.json()
        setArtworks(data ?? [])
      } finally {
        setLoadingArtworks(false)
      }
    })()
  }, [loading, role])

  if (loading) return null
  if (role === 'Viewer' || !role) return <ViewerHome />

  return <AdminHome artworks={artworks} loadingArtworks={loadingArtworks} />
}
