
'use client'

import Link from 'next/link'

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        backgroundColor: '#007a5e',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: 40,
        color: 'white',
      }}
    >
      <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: 40 }}>
        Art Proposals
      </h1>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 20,
          width: '100%',
          maxWidth: 700,
        }}
      >
        <EntryCard
          href="/artworks"
          title="Market"
          subtitle="Primary & secondary market"
        />

        <EntryCard
          href="/artworks/auctions"
          title="Auctions"
          subtitle="Auction artworks"
        />

        <EntryCard
          href="/referentials"
          title="Referentials"
          subtitle="Artists & contacts"
        />

        <EntryCard
          href="/artworks/print"
          title="Fiche descriptive"
          subtitle="pour impression"
        />

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
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow =
          '0 6px 16px rgba(0,0,0,0.15)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>
        {title}
      </div>
      <div style={{ marginTop: 6, color: '#666' }}>{subtitle}</div>
    </Link>
  )
}
