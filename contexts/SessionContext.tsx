
'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseBrowser'
import type { Session, User } from '@supabase/supabase-js'

export type UserRole = 'Viewer' | 'Editor' | 'Administrator'

type SessionProfileContextValue = {
  session: Session | null
  user: User | null
  role: UserRole | undefined
  isAuthenticated: boolean
  loading: boolean
  refreshSession: () => Promise<void>
}

const SessionContext = createContext<SessionProfileContextValue | undefined>(
  undefined
)

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<UserRole | undefined>(undefined)
  const [loading, setLoading] = useState(true)

  const fetchRole = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()

    return error ? undefined : (data?.role as UserRole | undefined)
  }, [])

  const updateLastActivity = useCallback(
  async (userId: string) => {
    try {
      const now = new Date()

      const lastPing =
        localStorage.getItem('artmuse_last_activity_ping')

      // maximum un update toutes les 15 minutes
      if (lastPing) {
        const diff =
          now.getTime() -
          new Date(lastPing).getTime()

        if (diff < 15 * 60 * 1000) {
          return
        }
      }

      await supabase
        .from('profiles')
        .update({
          last_activity_at: now.toISOString(),
        })
        .eq('id', userId)

      localStorage.setItem(
        'artmuse_last_activity_ping',
        now.toISOString()
      )
    } catch (error) {
      console.error(
        '[LAST_ACTIVITY]',
        error
      )
    }
  },
  []
)

  const loadSession = useCallback(
    async (currentSession?: Session | null) => {
      setLoading(true)

      const sessionPayload =
        currentSession ?? (await supabase.auth.getSession()).data.session

      const currentUser = sessionPayload?.user ?? null
      setSession(sessionPayload)
      setUser(currentUser)

      if (!currentUser) {
        setRole(undefined)
        setLoading(false)
        return
      }
      void updateLastActivity(currentUser.id)

      const profileRole = await fetchRole(currentUser.id)
      const metadataRole = currentUser.user_metadata?.role as
        | UserRole
        | undefined

      setRole(profileRole ?? metadataRole)
      setLoading(false)
    },
    [fetchRole]
  )

  useEffect(() => {
    let active = true

    const initialize = async () => {
      if (!active) return
      await loadSession()
    }

    initialize()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!active) return
      void loadSession(newSession)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [loadSession])

  useEffect(() => {
  if (!user?.id) return

  const interval = setInterval(() => {
    void updateLastActivity(user.id)
  }, 15 * 60 * 1000)

  return () => clearInterval(interval)
}, [user?.id, updateLastActivity])

  return (
    <SessionContext.Provider
      value={{
        session,
        user,
        role,
        isAuthenticated: Boolean(session),
        loading,
        refreshSession: () => loadSession(),
      }}
    >
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
