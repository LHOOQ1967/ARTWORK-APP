
'use client'

import { createContext, useContext, useState } from 'react'

type EditModeContextType = {
  isEditing: boolean
  setIsEditing: (value: boolean) => void
  toggle: () => void
}

const EditModeContext = createContext<EditModeContextType | undefined>(
  undefined
)

export function EditModeProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [isEditing, setIsEditing] = useState(false)

  function toggle() {
    setIsEditing(v => !v)
  }

  return (
    <EditModeContext.Provider
      value={{ isEditing, setIsEditing, toggle }}
    >
      {children}
    </EditModeContext.Provider>
  )
}

export function useEditMode() {
  const context = useContext(EditModeContext)

  if (!context) {
    throw new Error(
      'useEditMode must be used inside EditModeProvider'
    )
  }

  return context
}