
'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export type UserRole = 'Viewer' | 'Editor' | 'Administrator'

type SessionProfileContextValue = {
  role: UserRole | undefined
  loading: boolean
}

const SessionContext = createContext<SessionProfileContextValue | undefined>(
  undefined
)

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<UserRole | undefined>(undefined)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    const loadProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        if (active) {
          setRole(undefined)
          setLoading(false)
        }
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (active) {
        setRole(error ? undefined : data.role)
        setLoading(false)
      }
    }

    loadProfile()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(loadProfile)

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  return (
    <SessionContext.Provider value={{ role, loading }}>
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
