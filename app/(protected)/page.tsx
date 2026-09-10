
'use client'

import ViewerHome from '@/components/home/ViewerHome'
import AdminHome from '@/components/home/AdminHome'
import { useSessionProfile } from '@/contexts/SessionContext'

export default function HomePage() {
  const { role, loading } = useSessionProfile()

  if (loading) return null
  if (role === 'Viewer' || !role) return <ViewerHome />

  return <AdminHome />
}
