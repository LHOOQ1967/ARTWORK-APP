
'use client'

import { use } from 'react'
import ArtworkDetailContent from '@/app/components/artwork/ArtworkDetailContent'

export default function ArtworkEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  return <ArtworkDetailContent artworkId={id} />
}
