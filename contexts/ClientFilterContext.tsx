'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabaseBrowser'
import { useSessionProfile } from '@/contexts/SessionContext'
import { canViewClientNames } from '@/lib/permissions'

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
  const { role, user, hasAllClientsAccess, loading: sessionLoading } = useSessionProfile()
  const userId = user?.id
  const canSelectClient = !sessionLoading && canViewClientNames(role, hasAllClientsAccess)

  const [loadedClients, setLoadedClients] = useState<{ userId: string; clients: ClientOption[] } | null>(null)
  const clients = useMemo(
    () => canSelectClient && loadedClients?.userId === userId ? loadedClients?.clients ?? [] : [],
    [canSelectClient, loadedClients, userId]
  )
  const [storedClientId, setStoredClientId] = useState<string | null>(null)
  const [artworks, setArtworks] = useState<{ userId: string; clientId: string; ids: Set<string> } | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStoredClientId(readStoredClientId())
  }, [])

  useEffect(() => {
    if (!canSelectClient || !userId) return
    let cancelled = false

    void (async () => {
      const contacts: ClientContactRow[] = []
      for (let offset = 0; ; offset += 200) {
        const { data, error } = await supabase
          .from('contacts')
          .select('id, company_name, first_name, last_name')
          .eq('is_client', true)
          .order('id')
          .range(offset, offset + 199)
        if (cancelled) return
        if (error) {
          console.error('[CLIENT_FILTER] load clients', error)
          setLoadedClients(null)
          return
        }
        contacts.push(...(data ?? []))
        if (!data || data.length < 200) break
      }

      setLoadedClients({
        userId,
        clients: contacts
          .map((contact) => ({ id: contact.id, label: clientLabel(contact) }))
          .sort((a, b) => a.label.localeCompare(b.label, 'fr-CH', { sensitivity: 'base' })),
      })
    })()

    return () => {
      cancelled = true
    }
  }, [canSelectClient, userId])

  const selectedClient = useMemo(
    () => (canSelectClient ? clients.find((client) => client.id === storedClientId) ?? null : null),
    [canSelectClient, clients, storedClientId]
  )
  const selectedClientId = selectedClient?.id ?? null

  // Reloaded on navigation so newly added proposals or acquisitions are reflected.
  useEffect(() => {
    if (!selectedClientId || !userId) return
    let cancelled = false

    void (async () => {
      const ids = new Set<string>()
      for (let offset = 0; ; offset += 200) {
        const [proposalsResult, boughtResult] = await Promise.all([
          supabase.from('artwork_proposals').select('artwork_id').eq('contact_id', selectedClientId)
            .order('artwork_id').range(offset, offset + 199),
          supabase.from('artworks').select('id').eq('buyer_contact_id', selectedClientId)
            .order('id').range(offset, offset + 199),
        ])
        if (cancelled) return
        if (proposalsResult.error || boughtResult.error) {
          console.error('[CLIENT_FILTER] load artworks', proposalsResult.error || boughtResult.error)
          setArtworks(null)
          return
        }
        for (const row of proposalsResult.data ?? []) ids.add(row.artwork_id)
        for (const row of boughtResult.data ?? []) ids.add(row.id)
        if ((proposalsResult.data?.length ?? 0) < 200 && (boughtResult.data?.length ?? 0) < 200) break
      }
      setArtworks({ userId, clientId: selectedClientId, ids })
    })()

    return () => {
      cancelled = true
    }
  }, [selectedClientId, pathname, userId])

  const setSelectedClientId = useCallback((clientId: string | null) => {
    setStoredClientId(clientId)
    setArtworks(null)
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
      return Boolean(artworkId && artworks?.userId === userId &&
        artworks?.clientId === selectedClientId && artworks.ids.has(artworkId))
    },
    [isFilterActive, artworks, userId, selectedClientId]
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
