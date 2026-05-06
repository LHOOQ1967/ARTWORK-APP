
'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseBrowser'
import type { Session } from '@supabase/supabase-js'

export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    // 1️⃣ Charger la session depuis les cookies
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!isMounted) return
        setSession(data.session)
        setLoading(false)
      })
      .catch(() => {
        if (!isMounted) return
        setSession(null)
        setLoading(false)
      })

    // 2️⃣ Écouter les changements d’état auth
    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((_event, session) => {
        if (!isMounted) return
        setSession(session)
      })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  return { session, loading }
}
