
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
      return 'viewer_artworks_full_secure'

    case 'auctions':
      return 'viewer_artworks_full_secure'

    case 'prints':
      return 'viewer_artworks_full_secure'

    case 'documents':
      return 'viewer_documents'

    case 'artists':
      return 'viewer_artists'
  }
}


  // ✅ Admin / Editor
  switch (page) {
    case 'artworks':
      return 'artworks_full_admin'

    case 'auctions':
      return 'artworks_full_admin'

    case 'prints':
      return 'artworks_full_admin'

    case 'documents':
      return 'documents'

    case 'artists':
      return 'artists'
  }

  // 🚨 Sécurité : ne doit jamais arriver
  throw new Error(`resolveSource: unknown page "${page}"`)
}
