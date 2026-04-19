
'use client'

import { EditModeProvider } from '@/app/contexts/EditModeContext'
import ArtworkDetailContent from '@/app/components/artwork/ArtworkDetailContent'

export default function NewArtworkPage() {
  return (
    <EditModeProvider>
      <ArtworkDetailContent />
    </EditModeProvider>
  )
}
