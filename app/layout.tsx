
'use client'

import HeaderNav from '@/app/components/layout/HeaderNav'
import { SessionProvider } from '@/app/contexts/SessionContext'
import './globals.css'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <body style={{ margin: 0 }}>
        <SessionProvider>
          <HeaderNav />
          <main>{children}</main>
        </SessionProvider>
      </body>
    </html>
  )
}
