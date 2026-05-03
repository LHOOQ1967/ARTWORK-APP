
'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useSessionProfile } from '@/app/contexts/SessionContext'
import { canEditArtworks } from '@/lib/permissions'

export default function HeaderNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { profile, loading } = useSessionProfile()

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

  const canEdit =
    profile !== null ? canEditArtworks(profile.role) : false

  return (
    <header
      className="no-print"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 24px',
        backgroundColor: '#02804d',
      }}
    >
      {/* LEFT NAV */}
      <nav style={{ display: 'flex', gap: 16 }}>
        <Link href="/" style={navLink(isActive('/'))}>
          Home
        </Link>

        <Link href="/artworks" style={navLink(isActive('/artworks'))}>
          Artworks
        </Link>

        <Link
          href="/artworks/auctions"
          style={navLink(isActive('/artworks/auctions'))}
        >
          Auctions
        </Link>

        {/* ✅ Referentials uniquement Admin / Editor */}
        {!loading && canEdit && (
          <Link
            href="/referentials"
            style={navLink(isActive('/referentials'))}
          >
            Referentials
          </Link>
        )}

        <Link
          href="/artworks/print"
          style={navLink(isActive('/artworks/print'))}
        >
          Factsheets
        </Link>
      </nav>

      {/* RIGHT ACTIONS */}
      <div style={{ display: 'flex', gap: 10 }}>
        {/* ✅ Pendant le chargement : rien */}
        {loading && null}

        {/* ✅ Non connecté */}
        {!loading && !profile && (
          <Link href="/login">
            <button className="edit-button">Login</button>
          </Link>
        )}

        {/* ✅ Connecté */}
        {!loading && profile && (
          <button onClick={() => supabase.auth.signOut()}>
            Logout
          </button>
        )}
      </div>
    </header>
  )
}

function navLink(active: boolean): React.CSSProperties {
  return {
    color: 'white',
    fontWeight: 700,
    textDecoration: 'none',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    borderBottom: active
      ? '2px solid #1f1f1f'
      : '2px solid transparent',
    paddingBottom: 2,
  }
}
