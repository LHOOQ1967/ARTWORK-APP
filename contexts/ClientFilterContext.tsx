'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabaseBrowser'
import { useSessionProfile } from '@/contexts/SessionContext'

export type ClientOption = {
  id: string
  label: string
}

type ClientFilterContextValue = {
  canSelectClient: boolean
  clients: ClientOption[]
  selectedClientId: string | null
  selectedClient: ClientOption | null
  setSelectedClientId: (clientId: string | null) => void
  isFilterActive: boolean
  matchesClient: (artworkId: string | null | undefined) => boolean
}

const STORAGE_KEY = 'artmuse_selected_client'

const ClientFilterContext = createContext<ClientFilterContextValue | undefined>(undefined)

type ClientContactRow = {
  id: string
  company_name: string | null
  first_name: string | null
  last_name: string | null
}

function clientLabel(contact: ClientContactRow) {
  const company = contact.company_name?.trim() ?? ''
  const person = [contact.first_name, contact.last_name]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(' ')
  return company || person || '—'
}

function readStoredClientId() {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function ClientFilterProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname()
  const { role, loading: sessionLoading } = useSessionProfile()
  const canSelectClient = role === 'Administrator' || role === 'Editor'

  const [clients, setClients] = useState<ClientOption[]>([])
  const [storedClientId, setStoredClientId] = useState<string | null>(null)
  const [artworkIds, setArtworkIds] = useState<Set<string> | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStoredClientId(readStoredClientId())
  }, [])

  useEffect(() => {
    if (sessionLoading || !canSelectClient) return
    let cancelled = false

    void (async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, company_name, first_name, last_name')
        .eq('is_client', true)

      if (cancelled) return
      if (error) {
        console.error('[CLIENT_FILTER] load clients', error)
        setClients([])
        return
      }

      setClients(
        ((data ?? []) as ClientContactRow[])
          .map((contact) => ({ id: contact.id, label: clientLabel(contact) }))
          .sort((a, b) => a.label.localeCompare(b.label, 'fr-CH', { sensitivity: 'base' }))
      )
    })()

    return () => {
      cancelled = true
    }
  }, [sessionLoading, canSelectClient])

  const selectedClient = useMemo(
    () => (canSelectClient ? clients.find((client) => client.id === storedClientId) ?? null : null),
    [canSelectClient, clients, storedClientId]
  )
  const selectedClientId = selectedClient?.id ?? null

  // Reloaded on navigation so newly added proposals or acquisitions are reflected.
  useEffect(() => {
    if (!selectedClientId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setArtworkIds(null)
      return
    }
    let cancelled = false

    void (async () => {
      const [proposalsResult, boughtResult] = await Promise.all([
        supabase.from('artwork_proposals').select('artwork_id').eq('contact_id', selectedClientId),
        supabase.from('artworks').select('id').eq('buyer_contact_id', selectedClientId),
      ])

      if (cancelled) return
      if (proposalsResult.error) console.error('[CLIENT_FILTER] load proposals', proposalsResult.error)
      if (boughtResult.error) console.error('[CLIENT_FILTER] load acquisitions', boughtResult.error)

      const ids = new Set<string>()
      for (const row of (proposalsResult.data ?? []) as { artwork_id: string }[]) ids.add(row.artwork_id)
      for (const row of (boughtResult.data ?? []) as { id: string }[]) ids.add(row.id)
      setArtworkIds(ids)
    })()

    return () => {
      cancelled = true
    }
  }, [selectedClientId, pathname])

  const setSelectedClientId = useCallback((clientId: string | null) => {
    setStoredClientId(clientId)
    setArtworkIds(null)
    try {
      if (clientId) localStorage.setItem(STORAGE_KEY, clientId)
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      // The selection remains active in memory.
    }
  }, [])

  const isFilterActive = selectedClientId !== null

  const matchesClient = useCallback(
    (artworkId: string | null | undefined) => {
      if (!isFilterActive) return true
      return Boolean(artworkId && artworkIds?.has(artworkId))
    },
    [isFilterActive, artworkIds]
  )

  const value = useMemo<ClientFilterContextValue>(
    () => ({
      canSelectClient,
      clients,
      selectedClientId,
      selectedClient,
      setSelectedClientId,
      isFilterActive,
      matchesClient,
    }),
    [canSelectClient, clients, selectedClientId, selectedClient, setSelectedClientId, isFilterActive, matchesClient]
  )

  return <ClientFilterContext.Provider value={value}>{children}</ClientFilterContext.Provider>
}

export function useClientFilter() {
  const ctx = useContext(ClientFilterContext)
  if (!ctx) {
    throw new Error('useClientFilter must be used within ClientFilterProvider')
  }
  return ctx
}
