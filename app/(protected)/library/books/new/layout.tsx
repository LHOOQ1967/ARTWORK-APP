'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSessionProfile } from '@/contexts/SessionContext'

export default function LibraryBookNewLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { role, loading } = useSessionProfile()

  useEffect(() => {
    if (!loading && role && role !== 'Administrator' && role !== 'Editor') {
      router.replace('/not-authorized')
    }
  }, [role, loading, router])

  if (loading || !role) {
    return <div className="p-6 pt-20">Chargement...</div>
  }

  if (role !== 'Administrator' && role !== 'Editor') {
    return null
  }

  return <>{children}</>
}
