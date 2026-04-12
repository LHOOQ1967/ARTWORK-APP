
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseBrowser'

export default function HomePage() {
  const router = useRouter()

  useEffect(() => {
    // ✅ Supabase lit automatiquement les tokens depuis le hash
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        // ✅ Session OK → aller vers l’app
        router.replace('/artworks')
      } else {
        // ✅ Pas de session → aller login
        router.replace('/login')
      }
    })
  }, [router])

  return <p className="p-8">Checking authentication…</p>
}
