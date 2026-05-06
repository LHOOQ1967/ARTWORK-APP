
'use client'

import { supabase } from '@/lib/supabaseBrowser'

type Props = {
  artworkId: string
  onUploaded: (doc: any) => void
}

export default function ImageUploader({ artworkId, onUploaded }: Props) {
  async function uploadFile(file: File) {
    const ext = file.name.split('.').pop()
    const filename = `${crypto.randomUUID()}.${ext}`
    const path = `${artworkId}/${filename}`

    // 1️⃣ Upload vers Supabase Storage
    const { error } = await supabase.storage
      .from('artwork-images')
      .upload(path, file)

    if (error) {
      alert('Upload failed')
      console.error(error)
      return
    }

    // 2️⃣ Récupération URL publique
    const { data } = supabase.storage
      .from('artwork-images')
      .getPublicUrl(path)

    const publicUrl = data.publicUrl

    // 3️⃣ Création du document via API
    const res = await fetch(`/api/artworks/${artworkId}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        document_type: 'image',
        label: null,
        url: publicUrl,
        position: 0,
      }),
    })

    if (res.ok) {
      const doc = await res.json()
      onUploaded(doc)
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const items = Array.from(e.clipboardData.items)
    const imageItem = items.find(i => i.type.startsWith('image'))

    if (!imageItem) return

    const file = imageItem.getAsFile()
    if (file) uploadFile(file)
  }

  return (
    <div
      onPaste={handlePaste}
      tabIndex={0}
      style={{
        backgroundColor: 'white',
        textAlign: 'center',
        marginTop: 15,
        padding: 12,
        border: '1px dashed #5a5959',
        borderRadius: 6,
      }}
    >
      <strong>Add image</strong>
      <p>Paste (Ctrl/Cmd + V) or select a file</p>

      <input
        type="file"
        accept="image/*"
        onChange={e => {
          if (e.target.files && e.target.files[0]) {
            uploadFile(e.target.files[0])
          }
        }}
      />
    </div>
  )
}
