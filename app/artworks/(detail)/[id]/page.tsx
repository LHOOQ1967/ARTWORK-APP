
import ArtworkDetailContent from '@/app/components/artwork/ArtworkDetailContent'




export const dynamic = 'force-dynamic'

type PageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ mode?: string }>
}


export default async function ArtworkDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params
  const { mode } = await searchParams

  const isEditMode = mode === 'edit'

  return (
    <ArtworkDetailContent
      artworkId={id}
      isEditMode={isEditMode}
    />
  )
}
