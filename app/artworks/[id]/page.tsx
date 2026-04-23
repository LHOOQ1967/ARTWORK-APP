
import ArtworkDetailContent from '@/app/components/artwork/ArtworkDetailContent'
import { EditModeProvider } from '@/app/contexts/EditModeContext'

type PageProps = {
  params: {
    id: string
  }
}




export default async function ArtworkDetailPage({ params }: PageProps) {
  const { id } = await params; // ✅ INDISPENSABLE

  console.log('Server page resolved id =', id);

  if (!id) {
    throw new Error("ID de l'œuvre manquant");
  }

  return (
    <EditModeProvider>
      <ArtworkDetailContent artworkId={id} />
    </EditModeProvider>
  );
}
