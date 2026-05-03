
import type { UserRole } from '@/app/contexts/SessionContext'


export function canEditArtworks(role: UserRole | undefined): boolean {
  return role === 'Administrator' || role === 'Editor'
}
