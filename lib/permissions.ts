
import type { UserRole } from '@/contexts/SessionContext'


export function canEditArtworks(role: UserRole | undefined): boolean {
  return role === 'Administrator' || role === 'Editor'
}

export function canViewClientNames(role: UserRole | undefined, hasAllClientsAccess = false): boolean {
  return canEditArtworks(role) || (role === 'Viewer' && hasAllClientsAccess)
}
