
'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseBrowser'
import type { Session, User } from '@supabase/supabase-js'
import { invalidateTemporaryCaches, observeMutationFetch } from '@/lib/temporaryCache'

export type UserRole = 'Viewer' | 'Editor' | 'Administrator'

function isUserRole(value: unknown): value is UserRole {
  return value === 'Viewer' || value === 'Editor' || value === 'Administrator'
}

type SessionProfileContextValue = {
  session: Session | null
  user: User | null
  role: UserRole | undefined
  hasAllClientsAccess: boolean
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
  const [allClientsUserId, setAllClientsUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const sessionRequest = useRef(0)

  useEffect(() => {
    const original = window.fetch
    const observed = observeMutationFetch(
      original.bind(window), window.location.origin,
      new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin,
    )
    window.fetch = observed
    return () => {
      if (window.fetch === observed) window.fetch = original
      invalidateTemporaryCaches()
    }
  }, [])

  const fetchRole = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()

    return error || !isUserRole(data?.role) ? undefined : data.role
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
      const request = ++sessionRequest.current
      setLoading(true)

      const sessionPayload =
        currentSession ?? (await supabase.auth.getSession()).data.session

      if (request !== sessionRequest.current) return
      const currentUser = sessionPayload?.user ?? null
      setSession(sessionPayload)
      setUser(currentUser)
      setAllClientsUserId(null)

      if (!currentUser) {
        setRole(undefined)
        setLoading(false)
        return
      }
      void updateLastActivity(currentUser.id)

      const profileRole = await fetchRole(currentUser.id)
      let allClients = false
      if (profileRole === 'Viewer') {
        const { data, error } = await supabase.from('viewer_all_clients')
          .select('user_id').eq('user_id', currentUser.id).maybeSingle()
        if (error) console.error('[SESSION_PROFILE] Unable to load all-client access', error)
        else allClients = Boolean(data)
      }
      if (request !== sessionRequest.current) return
      setRole(profileRole)
      setAllClientsUserId(allClients ? currentUser.id : null)
      setLoading(false)
    },
    [fetchRole, updateLastActivity]
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
      invalidateTemporaryCaches()
      void loadSession(newSession)
    })

    return () => {
      active = false
      sessionRequest.current++
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
        hasAllClientsAccess: !loading && role === 'Viewer' && Boolean(user && allClientsUserId === user.id),
        isAuthenticated: Boolean(session),
        loading,
        refreshSession: () => {
          invalidateTemporaryCaches()
          return loadSession()
        },
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
