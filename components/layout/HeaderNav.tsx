
'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseBrowser'
import { useSessionProfile } from '@/contexts/SessionContext'

export default function HeaderNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { role, loading } = useSessionProfile()

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

  const canEdit = role === 'Administrator' || role === 'Editor'
  const isLoggedIn = !!role

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
        {/* ✅ Home : seulement si logué */}
        {isLoggedIn && (
          <Link
            href="/"
            prefetch={false}
            style={navLink(isActive('/'))}
          >
            Home
          </Link>
        )}

        {isLoggedIn && (
          <Link
            href="/artworks"
            prefetch={false}
            style={navLink(isActive('/artworks'))}
          >
            Artworks
          </Link>
        )}

        {isLoggedIn && (
          <Link
            href="/artworks/auctions"
            prefetch={false}
            style={navLink(isActive('/artworks/auctions'))}
          >
            Auctions
          </Link>
        )}

        {!loading && isLoggedIn && canEdit && (
          <Link
            href="/referentials"
            prefetch={false}
            style={navLink(isActive('/referentials'))}
          >
            Referentials
          </Link>
        )}

        {isLoggedIn && (
          <Link
            href="/artworks/print"
            prefetch={false}
            style={navLink(isActive('/artworks/print'))}
          >
            Factsheets
          </Link>
        )}
      </nav>

      {/* RIGHT ACTIONS */}
      <div style={{ display: 'flex', gap: 10 }}>
        {/* Chargement → rien */}
        {loading && null}

        {/* ✅ NON CONNECTÉ → Login (pas de prefetch) */}
        {!loading && !isLoggedIn && (
          <Link href="/login" prefetch={false}>
            <button className="edit-button">Login</button>
          </Link>
        )}

        {/* ✅ CONNECTÉ → Logout avec hard redirect */}
        {!loading && isLoggedIn && (
          <button
            className="edit-button"
            onClick={async () => {
              await supabase.auth.signOut()
              // 🔥 force un nouveau cycle serveur (vide le cache Next)
              window.location.href = '/login'
            }}
          >
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
