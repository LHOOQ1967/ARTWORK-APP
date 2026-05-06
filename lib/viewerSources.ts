
import type { UserRole } from '@/contexts/SessionContext'

export type ViewerPage =
  | 'artworks'
  | 'auctions'
  | 'prints'
  | 'documents'
  | 'artists'

/**
 * ✅ Source unique et contractuelle par page et par rôle
 * Toute page Viewer DOIT passer ici
 */
export function resolveSource(
  page: ViewerPage,
  role: UserRole
): string {
  // ✅ Viewer

if (typeof role === 'string' && role.toLowerCase() === 'viewer') {
  switch (page) {
    case 'artworks':
      return 'viewer_artworks_secure'

    case 'auctions':
      return 'viewer_auction_artworks_secure'

    case 'prints':
      return 'viewer_artwork_prints_secure'

    case 'documents':
      return 'viewer_documents'

    case 'artists':
      return 'viewer_artists'
  }
}


  // ✅ Admin / Editor
  switch (page) {
    case 'artworks':
      return 'artworks_base'

    case 'auctions':
      return 'auction_artworks_base'

    case 'prints':
      return 'artwork_print_view_admin'

    case 'documents':
      return 'documents'

    case 'artists':
      return 'artists'
  }

  // 🚨 Sécurité : ne doit jamais arriver
  throw new Error(`resolveSource: unknown page "${page}"`)
}
