
'use client'

import { useEditMode } from '@/contexts/EditModeContext'
import type { ArtworkForm } from '@/app/(protected)/types/artwork'

type Props = {
  artwork: ArtworkForm
  setArtwork: React.Dispatch<React.SetStateAction<ArtworkForm>>
  isCreate?: boolean
}

export default function ArtworkFormFields({
  artwork,
  setArtwork,
  isCreate = false,
}: Props) {

  // ✅ EN CREATE : PAS DE CONTEXTE, TOUJOURS AFFICHER
  if (isCreate) {
    return renderFields(artwork, setArtwork)
  }

  // ✅ EN EDIT : CONTEXTE OBLIGATOIRE
  const { isEditing } = useEditMode()

  if (!isEditing) return null
  if (!artwork.id) return null

  return renderFields(artwork, setArtwork)
}

function renderFields(
  artwork: ArtworkForm,
  setArtwork: React.Dispatch<React.SetStateAction<ArtworkForm>>
) {
  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <label>Title</label>
        <input
          value={artwork.title ?? ''}
          onChange={e =>
            setArtwork(prev => ({ ...prev, title: e.target.value }))
          }
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>Medium</label>
        <input
          value={artwork.medium ?? ''}
          onChange={e =>
            setArtwork(prev => ({
              ...prev,
              medium: e.target.value || null,
            }))
          }
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>Year of execution</label>
        <input
          type="number"
          value={artwork.year_execution ?? ''}
          onChange={e =>
            setArtwork(prev => ({
              ...prev,
              year_execution: e.target.value
                ? Number(e.target.value)
                : null,
            }))
          }
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>Signature</label>
        <input
          value={artwork.signature ?? ''}
          onChange={e =>
            setArtwork(prev => ({
              ...prev,
              signature: e.target.value || null,
            }))
          }
        />
      </div>
    </>
  )
}
