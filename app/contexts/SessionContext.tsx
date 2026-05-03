
'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export type UserRole = 'Viewer' | 'Editor' | 'Administrator'

export type SessionProfile = {
  id: string
  email: string
  role: UserRole
}

const SessionContext = createContext<
  SessionProfile | null | undefined
>(undefined)


export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<SessionProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        if (active) {
          setProfile(null)
          setLoading(false)
        }
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id,email,role')
        .eq('id', user.id)
        .single()

      if (active) {
        setProfile(error ? null : data)
        setLoading(false)
      }
    }

    loadProfile()

    const { data: { subscription } } =
      supabase.auth.onAuthStateChange(loadProfile)

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  return (
    <SessionContext.Provider value={{ profile, loading }}>
      {children}
    </SessionContext.Provider>
  )
}



export function useSessionProfile() {
  const ctx = useContext(SessionContext)
  if (!ctx) {
    throw new Error('useSessionProfile must be used within SessionProvider')
  }
  return ctx
}
