
'use client'

import { AuditProposedAtShortcut } from '@/components/AuditProposedAtShortcut'
import Link from 'next/link'
import { useMemo, useState } from 'react'

type Artwork = { id: string; title?: string; artist?: string }

type AdminHomeProps = {
  artworks: Artwork[]
  loadingArtworks: boolean
}


export default function AdminHome({ artworks, loadingArtworks }: AdminHomeProps) {
  return (
    <main
      style={{
        minHeight: '100vh',
        backgroundColor: '#006039',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: 40,
        color: 'white',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 20,
          width: '100%',
          maxWidth: 700,
        }}
      >
        <EntryCardNew
          href="https://buyerspremium.blondeau.ch/calculate.php"
          title="Buyers Premium"
          subtitle="Calculator"
        />
        <EntryCardNew
          href="https://buyerspremium.blondeau.ch/auction_time.php"
          title="Auction Time"
          subtitle="Calculator"
        />

        <AuditProposedAtShortcut />
      </div>

      {/* ✅ Footer poussé en bas */}
      <div style={{ marginTop: 'auto', paddingTop: 24, paddingBottom: 24 }}>
        <a
          href="https://www.blondeau.ch"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: 'white',
            textDecoration: 'none',
            fontSize: '1.1rem',
            opacity: 0.9,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
        >
          www.blondeau.ch
        </a>
      </div>
    </main>
  )
}






function EntryCard({
  href,
  title,
  subtitle,
}: {
  href: string
  title: string
  subtitle: string
}) {
  return (
    <Link
      href={href}
      style={{
        backgroundColor: 'white',
        color: '#333',
        padding: '24px 20px',
        borderRadius: 8,
        textDecoration: 'none',
        textAlign: 'center',
        transition: 'transform 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.15)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{title}</div>
      <div style={{ marginTop: 6, color: '#666' }}>{subtitle}</div>
    </Link>
  )
}


function EntryCardNew({
  href,
  title,
  subtitle,
}: {
  href: string
  title: string
  subtitle: string
}) {
  const isExternal = href.startsWith('http')

  return (
    <Link
      href={href}
      target={isExternal ? '_blank' : undefined} // ✅ ouvre nouvel onglet si externe
      rel={isExternal ? 'noopener noreferrer' : undefined}
      style={{
        backgroundColor: 'white',
        color: '#333',
        padding: '24px 20px',
        borderRadius: 8,
        textDecoration: 'none',
        textAlign: 'center',
        transition: 'transform 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.15)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{title}</div>
      <div style={{ marginTop: 6, color: '#666' }}>{subtitle}</div>
    </Link>
  )
}


function EntryCardFlorac({
  href,
  title,
  subtitle,
}: {
  href: string
  title: string
  subtitle: string
}) {
  return (
    <Link
      href={href}
      style={{
        backgroundColor: '#4A5068',
        color: 'white',
        padding: '24px 20px',
        borderRadius: 8,
        textDecoration: 'none',
        textAlign: 'center',
        transition: 'transform 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.15)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{title}</div>
      <div style={{ marginTop: 6, color: 'white' }}>{subtitle}</div>
    </Link>
  )
}


