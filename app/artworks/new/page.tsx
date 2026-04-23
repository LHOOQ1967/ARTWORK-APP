
'use client'

import ArtworkDetailContent from '@/app/components/artwork/ArtworkDetailContent'
import { EditModeProvider } from '@/app/contexts/EditModeContext'

export default function ArtworkNewPage() {
  return (
    <EditModeProvider>
      <ArtworkDetailContent artworkId="" />
    </EditModeProvider>
  )
}
