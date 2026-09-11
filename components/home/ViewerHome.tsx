'use client'

import Link from 'next/link'
import styles from './HomeDashboard.module.css'

type DashboardLink = {
  href: string
  title: string
  subtitle: string
  external?: boolean
}

const proposals: DashboardLink[] = [
  { href: '/artworks/active', title: 'Active proposals', subtitle: 'Sorted by priority' },
  { href: '/artworks', title: 'All proposals', subtitle: 'Browse every proposal' },
  { href: '/artworks/updated', title: 'Recently updated', subtitle: 'Latest changes first' },
  { href: '/artworks/archived', title: 'Archives', subtitle: 'Past and declined proposals' },
  { href: '/artworks/print', title: 'Factsheet', subtitle: 'Prepare and print records' },
]

const collection: DashboardLink[] = [
  { href: '/artworks/bought', title: 'Collection', subtitle: 'Sorted by acquisition date' },
  { href: '/inventory', title: 'Inventory', subtitle: 'Florac Works' },
  { href: '/valuations', title: 'Valuations', subtitle: 'Florac Works' },
  { href: '/commissions', title: 'Commissions', subtitle: 'Florac Works & GLM' },
]

const tools: DashboardLink[] = [
  { href: '/market', title: 'Market', subtitle: 'Fairs and auctions' },
  { href: '/library', title: 'Library', subtitle: 'Blondeau & Cie' },
  {
    href: 'https://buyerspremium.blondeau.ch/calculate.php',
    title: 'Buyers premium',
    subtitle: 'Open calculator',
    external: true,
  },
  {
    href: 'https://buyerspremium.blondeau.ch/auction_time.php',
    title: 'Auction time',
    subtitle: 'Open calculator',
    external: true,
  },
]

export default function ViewerHome() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={`${styles.section} ${styles.proposalsSection}`}>
          <SectionHeading title="Proposals" description="Review and follow every proposal" />
          <div className={styles.primaryGrid}>
            {proposals.map((item) => <DashboardCard key={item.href} item={item} />)}
          </div>
        </section>

        <div className={styles.viewerSectionGrid}>
          <section className={`${styles.section} ${styles.collectionSection}`}>
            <SectionHeading title="Collection" description="Browse acquired works" />
            <div className={styles.toolsGrid}>
              {collection.map((item) => <DashboardCard key={item.href} item={item} compact />)}
            </div>
          </section>

          <section className={`${styles.section} ${styles.toolsSection}`}>
            <SectionHeading title="Tools" description="Market and auction utilities" />
            <div className={styles.viewerToolsGrid}>
              {tools.map((item) => <DashboardCard key={item.href} item={item} compact />)}
            </div>
          </section>

        </div>

        <footer className={styles.footer}>
          <span>ArtMuse</span>
          <a href="https://www.blondeau.ch" target="_blank" rel="noopener noreferrer">
            blondeau.ch ↗
          </a>
        </footer>
      </div>
    </main>
  )
}

function SectionHeading({
  title,
  description,
}: Readonly<{
  title: string
  description: string
}>) {
  return (
    <div className={styles.sectionHeading}>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  )
}

function DashboardCard({
  item,
  compact = false,
}: Readonly<{
  item: DashboardLink
  compact?: boolean
}>) {
  return (
    <Link
      href={item.href}
      target={item.external ? '_blank' : undefined}
      rel={item.external ? 'noopener noreferrer' : undefined}
      className={`${styles.card} ${compact ? styles.compactCard : ''}`}
    >
      <div className={styles.cardCopy}>
        <h3>{item.title}</h3>
        {item.subtitle && <p>{item.subtitle}</p>}
      </div>
      <span className={styles.arrow}>{item.external ? '↗' : '→'}</span>
    </Link>
  )
}
