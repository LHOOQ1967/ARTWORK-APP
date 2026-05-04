
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import ArtworkSheet from '@/app/components/artwork/ArtworkSheet'
import type { ArtworkPrint } from '@/app/types/artwork'
import { resolveSource } from '@/lib/viewerSources'
import { useSessionProfile } from '@/app/contexts/SessionContext'


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
    if (!id) return

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



console.log(
  'PRINT DETAIL – FIELDS RETURNED:',
  Object.keys(data ?? {})
)


if (error) {
  console.error('PRINT LOAD ARTWORK FAILED')
  setArtwork(null)
  return
}


if (!data) {
  // artwork absent → comportement normal
  setArtwork(null)
  return
}



        setArtwork(data as ArtworkPrint)
      } catch (err) {
        if (!isMounted) return
        console.error(err)
        setArtwork(null)
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadArtwork()

    


    return () => {
      isMounted = false
    }
  }, [id])

  if (loading) {
    return <p style={{ padding: 40 }}>Loading artwork…</p>
  }

  if (!artwork) {
    return <p style={{ padding: 40 }}>Artwork not found</p>
  }

  


  return (
    <main style={{ padding: 40 }}> 

<ArtworkSheet
  key={artwork.id}
  artwork={artwork}
  canEdit={canEdit}
/>


    </main>
  )
}
