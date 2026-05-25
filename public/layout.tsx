
'use client'

import { SessionProvider } from '@/contexts/SessionContext'

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SessionProvider>
      {children}
    </SessionProvider>
  )
}