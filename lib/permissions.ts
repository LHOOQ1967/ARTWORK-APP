
import type { UserRole } from '@/contexts/SessionContext'


export function canEditArtworks(role: UserRole | undefined): boolean {
  return role === 'Administrator' || role === 'Editor'
}
