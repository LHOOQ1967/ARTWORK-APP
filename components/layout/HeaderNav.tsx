
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabaseBrowser'
import { useSessionProfile } from '@/contexts/SessionContext'



export default function HeaderNav() {
  const pathname = usePathname()
  const { role, loading } = useSessionProfile()

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

  const isLoggedIn = !!role

  return (


<header className="no-print app-header">


      {/* LEFT NAV */}
      <nav className="app-header-nav">
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
            href="/artworks/active"
            prefetch={false}
            style={navLink(isActive('/artworks/active'))}
          >
            Active
          </Link>
        )}

                {isLoggedIn && (
          <Link
            href="/artworks"
            prefetch={false}
            style={navLink(pathname === '/artworks')}
          >
            All
          </Link>
        )}


          {isLoggedIn && (
          <Link
            href="/artworks/updated"
            prefetch={false}
            style={navLink(isActive('/artworks/updated'))}
          >
            Updated
          </Link>
        )}

        {isLoggedIn && (
          <Link
            href="/artworks/import-label"
            prefetch={false}
            style={navLink(isActive('/artworks/import-label'))}
          >
            Import
          </Link>
        )}


      </nav>

      {/* RIGHT ACTIONS */}
      <div className="app-header-actions">
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
