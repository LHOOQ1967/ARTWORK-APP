
'use client'

import { useEditMode } from '@/app/contexts/EditModeContext'
import type { ArtworkForm } from '@/app/types/artwork'

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
  const { isEditing } = useEditMode()

  // ❌ Pas en mode édition → rien à afficher
  if (!isEditing) return null

  // ❌ En EDIT (pas CREATE), un id est obligatoire
  if (!isCreate && !artwork.id) return null

  return (
    <>
      {/* EXEMPLES DE CHAMPS */}

      <div style={{ marginBottom: 12 }}>
        <label>Title</label>
        
<input
  value={artwork.title}
  onChange={e =>
    setArtwork(prev => ({
      ...prev,
      title: e.target.value,
    }))
  }
  style={{
    width: '100%',
    padding: '6px 8px',
    backgroundColor: 'white',
    color: '#000',
    border: '1px solid #ccc',
    borderRadius: 4,
  }}
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
          style={{ width: '100%' }}
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