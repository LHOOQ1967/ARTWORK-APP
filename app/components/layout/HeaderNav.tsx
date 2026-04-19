
'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function HeaderNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [loggedIn, setLoggedIn] = useState(false)

  /* ✅ Check auth via backend (cookies) */
  useEffect(() => {
    fetch('/api/me')
      .then(res => res.json())
      .then(data => setLoggedIn(data.loggedIn))
      .catch(() => setLoggedIn(false))
  }, [])

  /* ✅ Logout */
  async function handleLogout() {
    await fetch('/api/logout', { method: 'POST' })
    router.push('/login')
  }

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

  return (
    <header
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 24px',
        backgroundColor: '#006b54',
      }}
    >
      {/* LEFT NAV */}



      <nav style={{ display: 'flex', gap: 16 }}>

        <Link href="/" style={navLink(isActive('/artworks'))}>
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

        <Link
          href="/referentials"
          style={navLink(isActive('/referentials'))}
        >
          Referentials
        </Link>
      </nav>

      {/* RIGHT ACTIONS */}
      <div style={{ display: 'flex', gap: 10 }}>
        {loggedIn && (
          <Link href="/artworks/new" style={primaryButton}>
            + New artwork
          </Link>
        )}

        {!loggedIn && (
          <Link href="/login" style={primaryButton}>
            Login
          </Link>
        )}

        {loggedIn && (
          <button onClick={handleLogout} style={dangerButton}>
            Logout
          </button>
        )}
      </div>
    </header>
  )
}

/* ===== styles ===== */


function navLink(active: boolean): React.CSSProperties {
  return {
    color: 'white', // gris foncé / gris moyen
    fontWeight: 700,                      // ✅ strong (gras)
    textDecoration: 'none',
    
textTransform: 'uppercase',
letterSpacing: '0.04em',
    borderBottom: active
      ? '2px solid #1f1f1f'
      : '2px solid transparent',
    paddingBottom: 2,
    transition: 'color 120ms ease, border-color 120ms ease',
  }
}


const primaryButton: React.CSSProperties = {
  backgroundColor: 'white',
  color: '#006b54',
  padding: '6px 12px',
  borderRadius: 4,
  fontWeight: 600,
  textDecoration: 'none',
}

const dangerButton: React.CSSProperties = {
  backgroundColor: '#ffe5e5',
  color: '#900',
  border: '1px solid #cc0000',
  padding: '6px 12px',
  borderRadius: 4,
  cursor: 'pointer',
}