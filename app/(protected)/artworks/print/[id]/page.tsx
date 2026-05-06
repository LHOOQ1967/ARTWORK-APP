
'use client'


import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseBrowser'   // ✅ CORRECT
import ArtworkSheet from '@/components/artwork/ArtworkSheet'
import type { ArtworkPrint } from '@/app/(protected)/types/artwork'
import { resolveSource } from '@/lib/viewerSources'
import { useSessionProfile } from '@/contexts/SessionContext'



function logSupabaseError(context: string, error: any) {
  if (!error) return
  console.error(context, {
    message: error.message,
    details: error.details,
    hint: error.hint,
    code: error.code,
  })
}




export default function ArtworkPrintPage() {
  const { id } = useParams<{ id: string }>()
  const { role } = useSessionProfile()

  const canEdit = role === 'Administrator' || role === 'Editor'
  const [artwork, setArtwork] = useState<ArtworkPrint | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id || !role) return

    let isMounted = true

    const loadArtwork = async () => {
      try {
        setLoading(true)

        const source = resolveSource('prints', role)

        const { data, error } = await supabase
          .from(source)
          .select('*')
          .eq('id', id)
          .maybeSingle()

        if (!isMounted) return

        if (error || !data) {
          setArtwork(null)
          return
        }

        setArtwork(data as ArtworkPrint)
      } catch (err) {
        if (isMounted) setArtwork(null)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadArtwork()

    return () => {
      isMounted = false
    }
  }, [id, role])

  if (loading) {
    return <p style={{ padding: 40 }}>Loading artwork…</p>
  }

  if (!artwork) {
    return <p style={{ padding: 40 }}>Artwork not found</p>
  }

  return (
    <main style={{ padding: 40 }}>
      <ArtworkSheet artwork={artwork} canEdit={canEdit} />
    </main>
  )
}
