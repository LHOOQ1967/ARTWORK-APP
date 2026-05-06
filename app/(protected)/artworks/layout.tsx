
'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { EditModeProvider, useEditMode } from '@/contexts/EditModeContext'

function EditModeController({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { isEditing, setIsEditing } = useEditMode()

  useEffect(() => {
    const shouldEdit =
      pathname.endsWith('/new') || pathname.endsWith('/edit')

    // ✅ CRITIQUE : ne mettre à jour QUE si nécessaire
    if (shouldEdit !== isEditing) {
      setIsEditing(shouldEdit)
    }
  }, [pathname, isEditing, setIsEditing])

  return <>{children}</>
}

export default function ArtworksLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <EditModeProvider>
      <EditModeController>{children}</EditModeController>
    </EditModeProvider>
  )
}
