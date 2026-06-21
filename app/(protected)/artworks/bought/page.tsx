
import ArtworkListUpdated from '@/components/artwork/ArtworkListUpdated'
import ArtworksIndexPage from '@/components/pages/ArtworksIndexPage'

export default function BoughtPage() {
  return (
    <ArtworksIndexPage
      title="Bought artworks"
      forcedStatus="Bought"
    />
  )
}
