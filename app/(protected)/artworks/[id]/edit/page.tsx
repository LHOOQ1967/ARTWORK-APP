
import ArtworkDetailContent from '@/app/components/artwork/ArtworkDetailContent'
import { EditModeProvider } from '@/app/contexts/EditModeContext'

type PageProps = {
  params: {
    id: string
  }
}

export default function ArtworkEditPage({ params }: PageProps) {
  const { id } = params

  if (!id) {
    throw new Error("ID de l'œuvre manquant")
  }

  return (
    <EditModeProvider defaultEditing={true}>
      <ArtworkDetailContent artworkId={id} />
    </EditModeProvider>
  )
}
