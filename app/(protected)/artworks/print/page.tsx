
'use client'

import { useSearchParams } from 'next/navigation'
import ArtworksPrintPage from './ArtworksPrintPage'

export default function ArtworksPrintPageWrapper() {
  const searchParams = useSearchParams()
  const preset = searchParams.get('preset') ?? 'default'

  return <ArtworksPrintPage key={preset} preset={preset} />
}
