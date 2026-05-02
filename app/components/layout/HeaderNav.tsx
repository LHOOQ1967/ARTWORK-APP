
'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function HeaderNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [loggedIn, setLoggedIn] = useState(false)

  // ✅ Auth state from Supabase
  useEffect(() => {
    // état initial
    supabase.auth.getUser().then(({ data }) => {
      setLoggedIn(!!data.user)
    })

    // écoute changements session
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoggedIn(!!session?.user)
    })

    return () => subscription.unsubscribe()
  }, [])

  // ✅ Logout Supabase
  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

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

        <Link
          href="/referentials"
          style={navLink(isActive('/referentials'))}
        >
          Referentials
        </Link>

        <Link
          href="/artworks/print"
          style={navLink(isActive('/artworks/print'))}
        >
          Factsheets
        </Link>
      </nav>

      {/* RIGHT ACTIONS */}
      <div style={{ display: 'flex', gap: 10 }}>


        {!loggedIn && (
         <Link href="/login">
           <button className="edit-button"

      onMouseUp={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = '0 3px 0 #bbb'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = '0 3px 0 #bbb'
      }}
    >
            Login
            </button>
          </Link>
        )}

        {loggedIn && (
          <button onClick={handleLogout} className="edit-button">
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

const primaryButton: React.CSSProperties = {
  backgroundColor: 'white',
  color: '#006b54',
  padding: '6px 12px',
  borderRadius: 4,
  fontWeight: 600,
  textDecoration: 'none',
}

const dangerButton: React.CSSProperties = {
  backgroundColor: ' #f3f3f3',
  color: '#006b54',
  border: '1px solid',
  padding: '6px 12px',
  borderRadius: 4,
  cursor: 'pointer',
  
}
