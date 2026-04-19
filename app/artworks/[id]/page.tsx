
'use client'

import { EditModeProvider } from '@/app/contexts/EditModeContext'
import ArtworkDetailContent from '@/app/components/artwork/ArtworkDetailContent'
import { useParams } from 'next/navigation'

export default function ArtworkDetailPage() {
  const { id } = useParams<{ id: string }>()

  return (
    <EditModeProvider>
      <ArtworkDetailContent artworkId={id} />
    </EditModeProvider>
  )
}
