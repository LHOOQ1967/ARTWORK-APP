
'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import HeaderNav from '@/components/layout/HeaderNav'
import { SessionProvider, useSessionProfile } from '@/contexts/SessionContext'

function ProtectedGuard({ children }: Readonly<{ children: React.ReactNode }>) {
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
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname()
  const pageSection = resolvePageSection(pathname)

  return (
    <SessionProvider>
      <HeaderNav />
      <ProtectedGuard>
        <div className="protected-page-shell" data-page-section={pageSection ?? undefined}>
          <main>{children}</main>
        </div>
      </ProtectedGuard>
    </SessionProvider>
  )
}

function resolvePageSection(pathname: string) {
  if (!pathname || pathname === '/') return null

  if (pathname.startsWith('/artworks/bought') || pathname.startsWith('/inventory') || pathname.startsWith('/valuations') || pathname.startsWith('/commissions')) {
    return 'collection'
  }

  if (pathname.startsWith('/market') || pathname.startsWith('/library')) {
    return 'tools'
  }

  if (
    pathname.startsWith('/artworks/import-label') ||
    pathname.startsWith('/artworks/new') ||
    pathname.startsWith('/buyer-searches') ||
    pathname.startsWith('/referentials') ||
    pathname.startsWith('/artists') ||
    pathname.startsWith('/authors') ||
    pathname.startsWith('/contacts') ||
    pathname.startsWith('/related-names') ||
    pathname.startsWith('/types') ||
    pathname.startsWith('/artist-categories') ||
    pathname.startsWith('/admin')
  ) {
    return 'management'
  }

  if (pathname.startsWith('/artworks')) {
    return 'proposals'
  }

  return null
}
