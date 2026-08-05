'use client'

import Link from 'next/link'
import styles from './HomeDashboard.module.css'

type DashboardLink = {
  href: string
  title: string
  subtitle: string
  icon: string
  external?: boolean
}

const proposals: DashboardLink[] = [
  { href: '/artworks/active', title: 'Active proposals', subtitle: 'Sorted by priority', icon: '01' },
  { href: '/artworks', title: 'All proposals', subtitle: 'Browse every proposal', icon: '02' },
  { href: '/artworks/updated', title: 'Recently updated', subtitle: 'Latest changes first', icon: '03' },
  { href: '/artworks/archived', title: 'Archives', subtitle: 'Past and declined proposals', icon: '04' },
  { href: '/artworks/print', title: 'Factsheet', subtitle: 'Prepare and print records', icon: '05' },
]

const collection: DashboardLink[] = [
  { href: '/artworks/bought', title: 'Collection', subtitle: 'Sorted by acquisition date', icon: 'CL' },
  { href: '/inventory', title: 'Inventory', subtitle: 'Florac works', icon: 'IV' },
  { href: '/commissions', title: 'Commissions', subtitle: 'Florac and Leopold Meyer', icon: 'CM' },
  { href: '/valuations', title: 'Valuations', subtitle: 'Florac works', icon: 'VL' },
]

const tools: DashboardLink[] = [
  { href: '/market', title: 'Market', subtitle: 'Fairs and auctions', icon: 'MK' },
  {
    href: 'https://buyerspremium.blondeau.ch/calculate.php',
    title: 'Buyers premium',
    subtitle: 'Open calculator',
    icon: 'BP',
    external: true,
  },
  {
    href: 'https://buyerspremium.blondeau.ch/auction_time.php',
    title: 'Auction time',
    subtitle: 'Open calculator',
    icon: 'AT',
    external: true,
  },
]

export default function ViewerHome() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={`${styles.section} ${styles.proposalsSection}`}>
          <SectionHeading index="01" title="Proposals" description="Review and follow every proposal" />
          <div className={styles.primaryGrid}>
            {proposals.map((item) => <DashboardCard key={item.href} item={item} />)}
          </div>
        </section>

        <div className={styles.viewerSectionGrid}>
          <section className={`${styles.section} ${styles.collectionSection}`}>
            <SectionHeading index="02" title="Collection" description="Browse acquired works" />
            <div className={styles.toolsGrid}>
              {collection.map((item) => <DashboardCard key={item.href} item={item} compact />)}
            </div>
          </section>

          <section className={`${styles.section} ${styles.toolsSection}`}>
            <SectionHeading index="03" title="Tools" description="Market and auction utilities" />
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
  index,
  title,
  description,
}: {
  index: string
  title: string
  description: string
}) {
  return (
    <div className={styles.sectionHeading}>
      <span>{index}</span>
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
}: {
  item: DashboardLink
  compact?: boolean
}) {
  return (
    <Link
      href={item.href}
      target={item.external ? '_blank' : undefined}
      rel={item.external ? 'noopener noreferrer' : undefined}
      className={`${styles.card} ${compact ? styles.compactCard : ''}`}
    >
      <span className={styles.cardIcon}>{item.icon}</span>
      <div className={styles.cardCopy}>
        <h3>{item.title}</h3>
        <p>{item.subtitle}</p>
      </div>
      <span className={styles.arrow}>{item.external ? '↗' : '→'}</span>
    </Link>
  )
}
