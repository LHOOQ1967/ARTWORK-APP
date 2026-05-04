
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSessionProfile } from '@/app/contexts/SessionContext'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { role } = useSessionProfile()
  const router = useRouter()

  useEffect(() => {
    if (role === 'Viewer') {
      router.replace('/')
    }
  }, [role, router])

  if (role === 'Viewer') {
    return <p style={{ padding: 40 }}>Redirecting…</p>
  }

  return (
    <>
      {children}
    </>
  )
}
