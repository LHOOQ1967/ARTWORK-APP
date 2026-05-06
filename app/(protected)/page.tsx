
'use client'

import ViewerHome from '@/components/home/ViewerHome'
import AdminHome from '@/components/home/AdminHome'
import { useSessionProfile } from '@/contexts/SessionContext'

export default function HomePage() {
  const { role, loading } = useSessionProfile()

  // ⏳ Attendre que la session soit chargée
  if (loading) return null

  // 👁️ Viewer (ou rôle indéfini) → home viewer
  if (role === 'Viewer' || !role) {
    return <ViewerHome />
  }

  // ✅ Administrator + Editor
  return <AdminHome />
}
