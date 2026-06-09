
'use client'

import Link from 'next/link'

export default function ViewerHome() {
return (
  <main
    style={{

    paddingTop: 100,
    paddingLeft: 10,
    paddingRight: 10,
    paddingBottom: 30,

      minHeight: '100vh',
      backgroundColor: '#006039',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      color: 'white',
    }}
  >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 20,
          width: '100%',

        }}
      >

      <EntryCardFlorac
        href="/artworks/"
        title="Artworks"
        subtitle="Sorted by Status"
      />


        <EntryCardFlorac
        href="/artworks/updated"
        title="Update"
        subtitle="Artworks Sorted by Date updated"
      />
      
      <EntryCardFlorac
        href="/artworks/print"
        title="Factsheets"
        subtitle="All Artworks"
      />

      <EntryCardFlorac
        href="/artworks/print?market=private&status=active&priority=all&sort=date&dir=desc"
        title="Private Market"
        subtitle="Active Proposals by date"
      />
      <EntryCardFlorac
        href="/artworks/print?market=auction&status=active&priority=all&sort=priority&dir=desc"
        title="Auction"
        subtitle="Active lots by priority"
      />

      <EntryCardFlorac
        href="/artworks/print?market=all&status=bought&priority=all&sort=date&dir=desc"
        title="Bought"
        subtitle="All Acquisitions by date"
      />

      <EntryCardFlorac
        href="/artworks/print?market=all&status=archived&priority=all&sort=date&dir=desc"
        title="All Archived"
        subtitle="All Artworks by date"
      />
      </div>

    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 20,
        width: '100%',
        maxWidth: 700,
        marginTop: 40,
      }}
    >
      <EntryCardNew
        href="market"
        title="Market"
        subtitle="Fairs and auctions"
      />
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
        e.currentTarget.style.boxShadow =
          '0 6px 16px rgba(0,0,0,0.15)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>
        {title}
      </div>
      <div style={{ marginTop: 6, color: '#666' }}>
        {subtitle}
      </div>
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
        border: '1px solid white',
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
