
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import HeaderNav from '@/components/layout/HeaderNav'
import { SessionProvider, useSessionProfile } from '@/contexts/SessionContext'

function ProtectedGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { role, loading } = useSessionProfile()

  useEffect(() => {
    // ✅ une fois qu'on sait que l'utilisateur n'est PAS logué
    if (!loading && !role) {
      router.replace('/login')
    }
  }, [loading, role, router])

  // ✅ pendant le load ou la redirection → rien
  if (loading || !role) {
    return null
  }

  return <>{children}</>
}

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SessionProvider>
      <HeaderNav />
      <ProtectedGuard>
        <main>{children}</main>
      </ProtectedGuard>
    </SessionProvider>
  )
}
