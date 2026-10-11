'use client'

import { formatArtworkYears } from '@/lib/artworkYears'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useClientFilter } from '@/contexts/ClientFilterContext'
import { useSessionProfile } from '@/contexts/SessionContext'
import { fetchWithAuth } from '@/lib/fetchWithAuth'
import { privateImageUrl } from '@/lib/privateImageUrl'
import {
  calculateInsurancePremium,
  getPolicyExpirationDate,
  getRemainingPolicyFraction,
} from '@/lib/insuranceCalculations'
import {
  getUsdInventoryTotal,
  usdRateKey,
  type HistoricalUsdRate,
} from '@/lib/inventoryCurrency'
import { getInventoryBuyerOptions, type InventoryBuyer } from '@/lib/inventoryBuyers'
import { supabase } from '@/lib/supabaseBrowser'
import { buildInsuranceEmail, type InsuranceEmailArtwork } from '@/lib/insuranceEmail'

type InsuranceArtwork = InventoryBuyer & InsuranceEmailArtwork & {
  id: string
  image_url: string | null
  title: string | null
  year_execution: string | null
  year_execution_start?: number | null
  date_acquisition: string | null
  first_name: string | null
  last_name: string | null
  cost_amount: number | null
  cost_currency: string | null
  commission_blondeau: number | null
  insurance_currency: string | null
  insurance_value: number | null
}

type InsurancePolicy = {
  annual_rate_percent: number | null
  policy_start_date: string | null
}

type PolicyDraft = {
  annualRatePercent: string
  startDate: string
}

type RateRequest = {
  currency: string
  date: string
}

function formatUsd(value: number | null) {
  if (value === null) return '—'
  return `USD ${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}`
}

function formatDate(value: string | null) {
  if (!value) return '—'
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB').format(date)
}

function parseRateDraft(value: string) {
  const normalized = value.trim().replace(',', '.')
  if (!normalized) return null
  const rate = Number(normalized)
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return undefined
  return rate
}

function parseDateDraft(value: string) {
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? value
    : undefined
}

export default function InsurancePage() {
  const router = useRouter()
  const { role } = useSessionProfile()
  const {
    canSelectClient,
    clients: editorClients,
    selectedClient: editorSelectedClient,
    selectedClientId: editorSelectedClientId,
    setSelectedClientId: setEditorSelectedClientId,
  } = useClientFilter()
  const canEdit = role === 'Administrator' || role === 'Editor'
  const canView = canEdit || role === 'Viewer'
  const [viewerClients, setViewerClients] = useState<{ id: string; label: string }[]>([])
  const [viewerClientId, setViewerClientId] = useState<string | null>(null)
  const [viewerClientsError, setViewerClientsError] = useState('')
  const [viewerClientsLoading, setViewerClientsLoading] = useState(false)
  const clients = canEdit ? editorClients : viewerClients
  const selectedClientId = canEdit ? editorSelectedClientId : viewerClientId
  const selectedClient = canEdit ? editorSelectedClient : viewerClients.find(client => client.id === viewerClientId)
  const setSelectedClientId = canEdit ? setEditorSelectedClientId : setViewerClientId

  const [artworks, setArtworks] = useState<InsuranceArtwork[]>([])
  const [loadingArtworks, setLoadingArtworks] = useState(true)
  const [artworksError, setArtworksError] = useState('')
  const [clientArtworkIds, setClientArtworkIds] = useState<Set<string> | null>(null)
  const [loadedClientId, setLoadedClientId] = useState<string | null>(null)
  const [buyerSelection, setBuyerSelection] = useState<{
    clientId: string
    buyerId: string | null
  } | null>(null)
  const [clientArtworksLoading, setClientArtworksLoading] = useState(false)
  const [clientArtworksError, setClientArtworksError] = useState('')
  const [policyDraft, setPolicyDraft] = useState<PolicyDraft>({
    annualRatePercent: '',
    startDate: '',
  })
  const [policyLoading, setPolicyLoading] = useState(false)
  const [policySaving, setPolicySaving] = useState(false)
  const [policyError, setPolicyError] = useState('')
  const [policySaved, setPolicySaved] = useState(false)
  const [rates, setRates] = useState<Record<string, HistoricalUsdRate>>({})
  const [ratesLoading, setRatesLoading] = useState(false)
  const [ratesError, setRatesError] = useState('')

  useEffect(() => {
    if (role && !canView) router.replace('/not-authorized')
  }, [canView, role, router])

  useEffect(() => {
    if (role !== 'Viewer') return
    let active = true
    async function loadClients() {
      setViewerClientsLoading(true)
      setViewerClientsError('')
      try {
        const response = await fetchWithAuth('/api/insurance/clients')
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Unable to load your insurance clients.')
        if (!active) return
        setViewerClients(result.clients)
        setViewerClientId(result.clients[0]?.id ?? null)
      } catch (error) {
        if (!active) return
        console.error('LOAD VIEWER INSURANCE CLIENTS FAILED:', error)
        setViewerClientsError(error instanceof Error ? error.message : 'Unable to load your clients.')
      } finally {
        if (active) setViewerClientsLoading(false)
      }
    }
    void loadClients()
    return () => { active = false }
  }, [role])

  useEffect(() => {
    let cancelled = false

    async function loadArtworks() {
      setLoadingArtworks(true)
      setArtworksError('')
      try {
        const allArtworks: InsuranceArtwork[] = []
        const pageSize = 1000

        for (let offset = 0; ; offset += pageSize) {
          const { data, error } = await supabase
            .from('v_inventory_bought')
            .select('id, image_url, title, year_execution, year_execution_start, date_acquisition, first_name, last_name, cost_amount, cost_currency, commission_blondeau, insurance_currency, insurance_value, buyer_contact_id, company_name, buyer_first_name, buyer_last_name, location_contact_name, destination_contact_name')
            .order('date_acquisition', { ascending: false })
            .order('id')
            .range(offset, offset + pageSize - 1)

          if (cancelled) return
          if (error) throw new Error(error.message)

          const batch = data ?? []
          if (batch.length > 0) {
            const { data: details, error: detailsError } = await supabase
              .from('artworks')
              .select('id, medium, height_cm, width_cm, depth_cm')
              .in('id', batch.map(artwork => artwork.id))
            if (cancelled) return
            if (detailsError) throw new Error(detailsError.message)
            const detailsById = new Map((details ?? []).map(artwork => [artwork.id, artwork]))
            for (const artwork of batch) {
              const detail = detailsById.get(artwork.id)
              if (!detail) throw new Error(`Unable to load email details for artwork ${artwork.id}.`)
              allArtworks.push({
                ...artwork,
                medium: detail.medium,
                height_cm: detail.height_cm,
                width_cm: detail.width_cm,
                depth_cm: detail.depth_cm,
              })
            }
          }
          if (batch.length < pageSize) break
        }

        setArtworks(allArtworks)
      } catch (error) {
        if (cancelled) return
        console.error('LOAD INSURANCE ARTWORKS ERROR:', error)
        setArtworksError(
          error instanceof Error ? error.message : 'Unable to load insured artworks.'
        )
      } finally {
        if (!cancelled) setLoadingArtworks(false)
      }
    }

    if (canView) void loadArtworks()
    return () => {
      cancelled = true
    }
  }, [canView])

  useEffect(() => {
    if (!selectedClientId || !canView) {
      setClientArtworkIds(null)
      setLoadedClientId(null)
      setPolicyDraft({ annualRatePercent: '', startDate: '' })
      setClientArtworksError('')
      setPolicyError('')
      return
    }

    let cancelled = false
    const clientId = selectedClientId

    async function loadClientInsurance() {
      setClientArtworksLoading(true)
      setPolicyLoading(true)
      setClientArtworksError('')
      setPolicyError('')
      setPolicySaved(false)
      setBuyerSelection(null)
      setPolicyDraft({ annualRatePercent: '', startDate: '' })

      try {
        const artworkIds = new Set<string>()
        const pageSize = 1000
        for (let offset = 0; ; offset += pageSize) {
          const { data, error } = await supabase
            .from('artwork_proposals')
            .select('artwork_id')
            .eq('contact_id', clientId)
            .order('artwork_id')
            .range(offset, offset + pageSize - 1)

          if (cancelled) return
          if (error) throw new Error(error.message)
          for (const proposal of data ?? []) artworkIds.add(proposal.artwork_id)
          if ((data ?? []).length < pageSize) break
        }

        const { data: policy, error: policyLoadError } = await supabase
          .from('client_insurance_policies')
          .select('annual_rate_percent, policy_start_date')
          .eq('client_id', clientId)
          .maybeSingle()

        if (cancelled) return
        if (policyLoadError) throw new Error(policyLoadError.message)

        setClientArtworkIds(artworkIds)
        setLoadedClientId(clientId)
        const savedPolicy = policy as InsurancePolicy | null
        setPolicyDraft({
          annualRatePercent: savedPolicy?.annual_rate_percent?.toString() ?? '',
          startDate: savedPolicy?.policy_start_date ?? '',
        })
      } catch (error) {
        if (cancelled) return
        console.error('LOAD CLIENT INSURANCE ERROR:', error)
        setClientArtworkIds(new Set())
        setLoadedClientId(clientId)
        setClientArtworksError(
          error instanceof Error ? error.message : 'Unable to load client data.'
        )
      } finally {
        if (!cancelled) {
          setClientArtworksLoading(false)
          setPolicyLoading(false)
        }
      }
    }

    void loadClientInsurance()
    return () => {
      cancelled = true
    }
  }, [canView, selectedClientId])

  const clientRows = useMemo(
    () => selectedClientId && loadedClientId === selectedClientId
      ? artworks.filter((artwork) => clientArtworkIds?.has(artwork.id))
      : [],
    [artworks, clientArtworkIds, loadedClientId, selectedClientId]
  )
  const buyerOptions = useMemo(
    () => getInventoryBuyerOptions(clientRows),
    [clientRows]
  )
  const effectiveBuyerId =
    buyerSelection?.clientId === selectedClientId &&
    buyerOptions.some((buyer) => buyer.id === buyerSelection.buyerId)
      ? buyerSelection.buyerId
      : null
  const rows = useMemo(
    () => clientRows.filter(
      (artwork) => !effectiveBuyerId || artwork.buyer_contact_id === effectiveBuyerId
    ),
    [clientRows, effectiveBuyerId]
  )

  const rateRequests = useMemo(() => {
    const requests = new Map<string, RateRequest>()
    for (const artwork of rows) {
      for (const [currency, amount] of [
        [artwork.cost_currency, artwork.cost_amount],
        [artwork.insurance_currency, artwork.insurance_value],
      ] as const) {
        if (amount === null || currency === 'USD') continue
        const date = artwork.date_acquisition?.slice(0, 10) ?? ''
        const key = usdRateKey(currency, date)
        requests.set(key, { currency: currency ?? '', date })
      }
    }
    return JSON.stringify([...requests.entries()].sort(([a], [b]) => a.localeCompare(b)))
  }, [rows])

  useEffect(() => {
    const requests = JSON.parse(rateRequests) as [string, RateRequest][]
    if (!selectedClientId || requests.length === 0) {
      setRates({})
      setRatesError('')
      setRatesLoading(false)
      return
    }

    let cancelled = false
    async function loadRates() {
      setRatesLoading(true)
      setRatesError('')
      setRates({})
      try {
        const loaded: Record<string, HistoricalUsdRate> = {}
        for (const [key, request] of requests) {
          if (!request.currency || !request.date) {
            throw new Error('Missing currency or acquisition date: USD conversion is not possible.')
          }
          const response = await fetchWithAuth(
            `/api/inventory/usd-rate?currency=${encodeURIComponent(request.currency)}&date=${encodeURIComponent(request.date)}`
          )
          const payload = await response.json() as HistoricalUsdRate & { error?: string }
          if (!response.ok) {
            throw new Error(`${request.currency} on ${request.date}: ${payload.error ?? 'Exchange rate unavailable'}`)
          }
          loaded[key] = { rate: payload.rate, date: payload.date }
          if (cancelled) return
        }
        setRates(loaded)
      } catch (error) {
        if (cancelled) return
        console.error('LOAD INSURANCE USD RATES ERROR:', error)
        setRatesError(error instanceof Error ? error.message : 'Unable to load USD exchange rates.')
      } finally {
        if (!cancelled) setRatesLoading(false)
      }
    }

    void loadRates()
    return () => {
      cancelled = true
    }
  }, [rateRequests, selectedClientId])

  const expirationDate = policyDraft.startDate
    ? getPolicyExpirationDate(policyDraft.startDate)
    : null
  const ratePercent = parseRateDraft(policyDraft.annualRatePercent)
  const invalidRate = ratePercent === undefined
  const totalUsdIncomplete = rows.some((artwork) => totalUsd(artwork) === null)
  const insuredValueIncomplete = rows.some(
    (artwork) => artwork.insurance_value !== null && insuranceValueUsd(artwork) === null
  )
  const totalPremium = rows.reduce((total, artwork) => {
    const premium = premiumFor(artwork)
    return premium === null ? total : total + premium
  }, 0)
  const premiumIncomplete =
    ratePercent === null ||
    expirationDate === null ||
    rows.some(
      (artwork) =>
        artwork.insurance_value !== null && premiumFor(artwork) === null
    )
  const artworksWithoutInsuranceValue = rows.filter(
    (artwork) => artwork.insurance_value === null
  ).length

  function fxRate(currency: string | null, date: string | null) {
    if (currency === 'USD') return 1
    if (!currency || !date) return null
    return rates[usdRateKey(currency, date)]?.rate ?? null
  }

  function totalUsd(artwork: InsuranceArtwork) {
    return getUsdInventoryTotal(
      artwork.cost_amount,
      artwork.commission_blondeau,
      fxRate(artwork.cost_currency, artwork.date_acquisition)
    )
  }

  function insuranceValueUsd(artwork: InsuranceArtwork) {
    if (artwork.insurance_value === null) return null
    const rate = fxRate(artwork.insurance_currency, artwork.date_acquisition)
    return rate === null ? null : artwork.insurance_value * rate
  }

  function premiumFor(artwork: InsuranceArtwork) {
    const remainingFraction = artwork.date_acquisition && policyDraft.startDate
      ? getRemainingPolicyFraction(
        policyDraft.startDate,
        artwork.date_acquisition.slice(0, 10)
      )
      : null
    return calculateInsurancePremium(
      insuranceValueUsd(artwork),
      ratePercent === undefined ? null : ratePercent,
      remainingFraction
    )
  }

  async function savePolicy() {
    if (!selectedClientId || !canEdit || policySaving) return
    if (invalidRate) {
      setPolicyError('The annual rate must be between 0 and 100%.')
      return
    }

    const startDate = parseDateDraft(policyDraft.startDate)
    if (startDate === undefined) {
      setPolicyError('Please enter a valid policy start date.')
      return
    }

    setPolicySaving(true)
    setPolicyError('')
    setPolicySaved(false)
    try {
      const { error } = await supabase
        .from('client_insurance_policies')
        .upsert({
          client_id: selectedClientId,
          annual_rate_percent: ratePercent,
          policy_start_date: startDate,
        }, { onConflict: 'client_id' })

      if (error) throw new Error(error.message)
      setPolicySaved(true)
    } catch (error) {
      console.error('SAVE CLIENT INSURANCE POLICY ERROR:', error)
      setPolicyError(
        error instanceof Error ? error.message : 'Unable to save the policy.'
      )
    } finally {
      setPolicySaving(false)
    }
  }

  if (!canView) {
    return null
  }

  return (
    <section className="mx-auto max-w-7xl space-y-6 p-4 pt-20 md:p-6 md:pt-20">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Insurance</h1>
          <p className="mt-1 text-sm text-gray-600">
            Purchased artworks proposed to the selected client.
          </p>
        </div>
        <label className="flex min-w-56 flex-col gap-1 text-sm">
          Client
          <select
            className="rounded border bg-white px-3 py-2"
            value={selectedClientId ?? ''}
            onChange={(event) => setSelectedClientId(event.target.value || null)}
            disabled={canEdit ? !canSelectClient : viewerClientsLoading}
          >
            <option value="">Select a client</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>{client.label}</option>
            ))}
          </select>
        </label>
      </header>
      {viewerClientsError && <p role="alert" className="text-red-700">{viewerClientsError}</p>}
      {!canEdit && viewerClientsLoading && <p>Loading your clients…</p>}
      {!canEdit && !viewerClientsLoading && !viewerClientsError && clients.length === 0 && (
        <p>No insurance clients are linked to your account.</p>
      )}

      {selectedClientId && (
        <label className="flex flex-col gap-1 text-sm">
          Buyer
          <select
            className="rounded border bg-white px-3 py-2"
            value={effectiveBuyerId ?? ''}
            onChange={(event) => setBuyerSelection({
              clientId: selectedClientId,
              buyerId: event.target.value || null,
            })}
            disabled={
              loadingArtworks || clientArtworksLoading ||
              loadedClientId !== selectedClientId ||
              Boolean(artworksError || clientArtworksError)
            }
          >
            <option value="">All buyers</option>
            {buyerOptions.map((buyer) => (
              <option key={buyer.id} value={buyer.id}>{buyer.label}</option>
            ))}
          </select>
          <span className="text-gray-600">
            Only buyers of the selected client&apos;s artworks are listed.
            The policy applies to the client; totals reflect the Buyer filter.
          </span>
        </label>
      )}

      {selectedClientId && (
        <section className="rounded border bg-gray-50 p-4">
          <h2 className="font-medium">
            Insurance policy{selectedClient ? ` — ${selectedClient.label}` : ''}
          </h2>
          <div className="mt-3 flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-sm">
              Annual premium rate (%)
              <input
                className="w-48 rounded border bg-white px-3 py-2"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={policyDraft.annualRatePercent}
                onChange={(event) => {
                  setPolicyDraft((current) => ({ ...current, annualRatePercent: event.target.value }))
                  setPolicySaved(false)
                }}
                disabled={!canEdit || policyLoading || policySaving}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Policy start date
              <input
                className="rounded border bg-white px-3 py-2"
                type="date"
                value={policyDraft.startDate}
                onChange={(event) => {
                  setPolicyDraft((current) => ({ ...current, startDate: event.target.value }))
                  setPolicySaved(false)
                }}
                disabled={!canEdit || policyLoading || policySaving}
              />
            </label>
            <div className="pb-2 text-sm text-gray-600">
              Expiration date: {expirationDate ? formatDate(expirationDate) : '—'}
            </div>
            {canEdit && <button
              type="button"
              className="rounded border bg-white px-4 py-2 font-medium"
              onClick={() => void savePolicy()}
              disabled={policyLoading || policySaving || invalidRate}
            >
              {policySaving ? 'Saving…' : 'Save policy'}
            </button>}
          </div>
          <p className="mt-3 text-sm text-gray-600">
            The premium covers the full year if the purchase is on or before the policy start date.
            Otherwise, it is prorated from the purchase date to the expiration date,
            using insured values converted to USD. Cost USD is for information only
            and is not used to calculate the premium.
          </p>
          {policyError && <p className="mt-2 text-sm text-red-700" role="alert">{policyError}</p>}
          {policySaved && <p className="mt-2 text-sm text-green-700" role="status">Policy saved.</p>}
          {policyLoading && <p className="mt-2 text-sm text-gray-500">Loading policy…</p>}
        </section>
      )}

      {!selectedClientId ? (
        <p className="rounded border p-6 text-center text-gray-600">
          Select a client to view their insurance list.
        </p>
      ) : loadingArtworks || clientArtworksLoading || loadedClientId !== selectedClientId ? (
        <p className="text-sm text-gray-500">Loading artworks…</p>
      ) : artworksError || clientArtworksError ? (
        <div className="rounded border border-red-300 bg-red-50 p-4 text-red-800" role="alert">
          Unable to load the list: {artworksError || clientArtworksError}
        </div>
      ) : (
        <>
          {ratesLoading && <p className="text-sm text-gray-500">Loading historical USD exchange rates…</p>}
          {ratesError && <p className="text-sm text-red-700" role="alert">{ratesError}</p>}
          {!ratesLoading && !ratesError && totalUsdIncomplete && (
            <p className="text-sm text-red-700" role="alert">
              Some USD costs are incomplete: missing cost, currency, date, or exchange rate.
            </p>
          )}
          {!ratesLoading && !ratesError && insuredValueIncomplete && (
            <p className="text-sm text-red-700" role="alert">
              Some premiums cannot be calculated: missing currency, date, or exchange rate.
            </p>
          )}
          {artworksWithoutInsuranceValue > 0 && (
            <p className="text-sm text-amber-700" role="status">
              {artworksWithoutInsuranceValue} artwork{artworksWithoutInsuranceValue > 1 ? 's' : ''} with
              no insured value: their premiums are excluded from the total.
            </p>
          )}
          {rows.some((artwork) => !parseDateDraft(artwork.date_acquisition?.slice(0, 10) ?? '')) && (
            <p className="text-sm text-red-700" role="alert">
              Some premiums cannot be calculated: missing or invalid purchase date.
            </p>
          )}
          {(ratePercent === null || expirationDate === null) && (
            <p className="text-sm text-amber-700" role="status">
              Enter the annual rate and policy start date to calculate premiums.
            </p>
          )}
          <div className="overflow-x-auto rounded border">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr className="border-b text-left">
                  <th className="px-3 py-2">Image</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Artist</th>
                  <th className="px-3 py-2">Artwork</th>
                  <th className="px-3 py-2 text-right">Cost USD</th>
                  <th className="px-3 py-2 text-right">Insured value (USD)</th>
                  <th className="px-3 py-2 text-right">Premium</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((artwork) => {
                  const premium = premiumFor(artwork)
                  const email = buildInsuranceEmail(artwork)
                  return (
                    <tr
                      key={artwork.id}
                      className="cursor-pointer border-b hover:bg-gray-50"
                      onClick={() => router.push(`/artworks/print/${artwork.id}`)}
                    >
                      <td className="px-3 py-2">
                        {artwork.image_url ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={privateImageUrl(artwork.image_url)}
                            alt={artwork.title ?? 'Artwork'}
                            width={48}
                            height={48}
                            loading="lazy"
                            className="h-12 w-12 rounded object-cover"
                          />
                        ) : (
                          <span className="flex h-12 w-12 items-center justify-center rounded bg-gray-100 text-xs text-gray-500">
                            —
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">{formatDate(artwork.date_acquisition)}</td>
                      <td className="px-3 py-2">
                        {[artwork.first_name, artwork.last_name].filter(Boolean).join(' ') || '—'}
                      </td>
                      <td className="px-3 py-2">
                        {artwork.title ?? '—'}
                        {formatArtworkYears(artwork.year_execution, artwork.year_execution_start) ? `, ${formatArtworkYears(artwork.year_execution, artwork.year_execution_start)}` : ''}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                        {formatUsd(ratesLoading ? null : totalUsd(artwork))}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                        {formatUsd(ratesLoading ? null : insuranceValueUsd(artwork))}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                        {formatUsd(
                          ratesLoading || policyLoading || invalidRate
                            ? null
                            : premium
                        )}
                        {canEdit && <a
                          href={email.href}
                          onClick={(event) => event.stopPropagation()}
                          className="ml-3 inline-block rounded border px-2 py-1 text-xs font-normal text-blue-700 hover:bg-blue-50 print:hidden"
                          aria-label={`Draft insurance email for ${artwork.title ?? 'Artwork'}`}
                          title="Open an email draft to alison.hillier@howdengroup.com"
                        >
                          Email
                        </a>}
                        {canEdit && email.missingFields.length > 0 && (
                          <span className="mt-1 block whitespace-normal text-xs text-amber-700 print:hidden">
                            Email missing: {email.missingFields.join(', ')}. Complete the placeholders before sending.
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold">
                  <td className="px-3 py-2" colSpan={4}>Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatUsd(
                      ratesLoading || ratesError || totalUsdIncomplete
                        ? null
                        : rows.reduce((sum, artwork) => sum + (totalUsd(artwork) ?? 0), 0)
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatUsd(
                      ratesLoading || insuredValueIncomplete
                        ? null
                        : rows.reduce((sum, artwork) => sum + (insuranceValueUsd(artwork) ?? 0), 0)
                    )}
                    {artworksWithoutInsuranceValue > 0 && (
                      <span className="block text-xs font-normal text-amber-700">
                        Partial total: missing values
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatUsd(
                      ratesLoading || ratesError || policyLoading || invalidRate || premiumIncomplete
                        ? null
                        : totalPremium
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
            {rows.length === 0 && (
              <p className="p-6 text-center text-gray-500">
                No purchased artworks for the selected client and buyer.
              </p>
            )}
          </div>
        </>
      )}
    </section>
  )
}
