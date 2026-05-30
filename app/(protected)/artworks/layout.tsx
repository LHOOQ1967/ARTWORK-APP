
export const dynamic = 'force-dynamic'
export const revalidate = 0

import EditModeWrapper from './EditModeWrapper'



export default function ArtworksLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <EditModeWrapper>{children}</EditModeWrapper>
}
