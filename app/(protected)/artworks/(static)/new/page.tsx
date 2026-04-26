
'use client'

import ArtworkCreateContent from '@/app/components/artwork/ArtworkCreateContent'
import { EditModeProvider } from '@/app/contexts/EditModeContext'

export default function ArtworkNewPage() {
  return (
    <EditModeProvider>
      <ArtworkCreateContent />
    </EditModeProvider>
  )
}
