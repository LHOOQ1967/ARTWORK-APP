
'use client'

import ViewerHome from '@/app/components/home/ViewerHome'
import AdminHome from '@/app/components/home/AdminHome'
import { useSessionProfile } from '@/app/contexts/SessionContext'

export default function HomePage() {
  const { profile, loading } = useSessionProfile()

  if (loading) return null

  if (!profile || profile.role === 'Viewer') {
    return <ViewerHome />
  }

  return <AdminHome /> // Administrator + Editor
}
