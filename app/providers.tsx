
'use client'

import { createBrowserClient } from '@supabase/ssr'
import { SupabaseProvider } from '@supabase/auth-helpers-react'
import { useState } from 'react'

export function AppSupabaseProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [supabase] = useState(() =>
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  )

  return (
    <SupabaseProvider client={supabase}>
      {children}
    </SupabaseProvider>
  )
}
