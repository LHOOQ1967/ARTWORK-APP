'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

type Contact = {
  id: string
  company_name: string | null
  first_name: string | null
  last_name: string | null
}

type Artwork = {
  id: string
  image_url: string | null
  title: string | null
  year_execution: number | null
  date_acquisition: string | null
  cost_amount: number | null
  cost_currency: string | null
  purchase_cost: number | null
  commission_blondeau: number | null
  fx_rate_to_eur: number | null
  artist: {
    first_name: string | null
    last_name: string | null
  } | null
}

type Valuation = {
  id: string
  artwork_id: string
  expert_contact_id: string
  valuation_date: string
  amount: number
  currency: string
  notes: string | null
  expert: Contact | null
}

function contactLabel(contact: Contact | null) {
  if (!contact) return 'Expert inconnu'
  return (
    contact.company_name ||
    [contact.first_name, contact.last_name].filter(Boolean).join(' ') ||
    'Contact sans nom'
  )
}

function normalizedContactLabel(contact: Contact) {
  return contactLabel(contact)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLocaleLowerCase('fr')
}

function preferredExpertId(contacts: Contact[], name: string) {
  const normalizedName = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLocaleLowerCase('fr')

  return contacts.find((contact) => normalizedContactLabel(contact) === normalizedName)?.id ?? ''
}

function artworkLabel(artwork: Artwork | undefined) {
  if (!artwork) return 'Œuvre supprimée'
  const artist = artwork.artist
    ? [artwork.artist.first_name, artwork.artist.last_name].filter(Boolean).join(' ')
    : ''
  const title = [artwork.title, artwork.year_execution].filter(Boolean).join(', ')
  return [artist, title].filter(Boolean).join(' — ') || 'Œuvre sans titre'
}

function compareArtworks(first: Artwork | undefined, second: Artwork | undefined) {
  const compare = (firstValue: string | null | undefined, secondValue: string | null | undefined) =>
    (firstValue ?? '').localeCompare(secondValue ?? '', 'fr', {
      sensitivity: 'base',
    })

  return (
    compare(first?.artist?.last_name, second?.artist?.last_name) ||
    compare(first?.artist?.first_name, second?.artist?.first_name) ||
    compare(first?.title, second?.title) ||
    (first?.year_execution ?? 0) - (second?.year_execution ?? 0)
  )
}

function formatDate(date: string | null) {
  if (!date) return '—'

  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00`))
}

function formatAmount(amount: number, currency: string) {
  return `${currency} ${new Intl.NumberFormat('fr-CH', {
    maximumFractionDigits: 2,
  }).format(amount)}`
}

function getTotalAcquisitionCost(artwork: Artwork) {
  const foreignSubtotal =
    (artwork.cost_amount ?? 0) + (artwork.commission_blondeau ?? 0)
  const fees = artwork.purchase_cost ?? 0

  if (foreignSubtotal === 0) return fees
  if (artwork.fx_rate_to_eur === null) return null

  return foreignSubtotal * artwork.fx_rate_to_eur + fees
}

function formatTotalAcquisitionCost(artwork: Artwork) {
  const total = getTotalAcquisitionCost(artwork)
  return total === null ? '—' : formatAmount(total, 'EUR')
}

function latestValuations(
  valuations: Valuation[],
  artworkId: string,
  expertId: string
) {
  return valuations
    .filter(
      (valuation) =>
        valuation.artwork_id === artworkId &&
        valuation.expert_contact_id === expertId
    )
    .sort((first, second) =>
      second.valuation_date.localeCompare(first.valuation_date)
    )
    .slice(0, 5)
}

function valuationTotalsByYear(
  valuations: Valuation[],
  artworkIds: Set<string>,
  expertId: string
) {
  const totals = new Map<string, Map<string, number>>()

  for (const valuation of valuations) {
    if (
      valuation.expert_contact_id !== expertId ||
      !artworkIds.has(valuation.artwork_id)
    ) {
      continue
    }

    const year = valuation.valuation_date.slice(0, 4)
    const yearlyTotals = totals.get(year) ?? new Map<string, number>()
    yearlyTotals.set(
      valuation.currency,
      (yearlyTotals.get(valuation.currency) ?? 0) + valuation.amount
    )
    totals.set(year, yearlyTotals)
  }

  return [...totals.entries()]
    .sort(([firstYear], [secondYear]) => secondYear.localeCompare(firstYear))
    .map(([year, amounts]) => ({
      year,
      amounts: [...amounts.entries()].sort(([firstCurrency], [secondCurrency]) =>
        firstCurrency.localeCompare(secondCurrency)
      ),
    }))
}

function acquisitionTotalsByValuationYear(
  valuations: Valuation[],
  artworks: Artwork[],
  expertIds: string[]
) {
  const artworkIdsByYear = new Map<string, Set<string>>()
  const selectedExperts = new Set(expertIds.filter(Boolean))

  for (const valuation of valuations) {
    if (!selectedExperts.has(valuation.expert_contact_id)) continue

    const year = valuation.valuation_date.slice(0, 4)
    const artworkIds = artworkIdsByYear.get(year) ?? new Set<string>()
    artworkIds.add(valuation.artwork_id)
    artworkIdsByYear.set(year, artworkIds)
  }

  const artworksById = new Map(artworks.map((artwork) => [artwork.id, artwork]))
  return new Map(
    [...artworkIdsByYear.entries()].map(([year, artworkIds]) => [
      year,
      [...artworkIds].reduce((total, artworkId) => {
        const artwork = artworksById.get(artworkId)
        return total + (artwork ? (getTotalAcquisitionCost(artwork) ?? 0) : 0)
      }, 0),
    ])
  )
}

export default function ValuationsHistoryPage() {
  const [artworks, setArtworks] = useState<Artwork[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [valuations, setValuations] = useState<Valuation[]>([])
  const [firstExpertId, setFirstExpertId] = useState('')
  const [secondExpertId, setSecondExpertId] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadData() {
      const response = await fetch('/api/valuations')
      const payload = (await response.json()) as {
        artworks?: Artwork[]
        contacts?: Contact[]
        valuations?: Valuation[]
        error?: string
      }

      if (!response.ok) {
        setError(payload.error ?? 'Impossible de charger l’historique.')
      } else {
        setArtworks(payload.artworks ?? [])
        setContacts(payload.contacts ?? [])
        setValuations(payload.valuations ?? [])
      }
      setLoading(false)
    }

    void loadData()
  }, [])

  const availableExperts = contacts

  const displayedFirstExpertId =
    firstExpertId ||
    preferredExpertId(availableExperts, 'Paul Coulon') ||
    availableExperts[0]?.id ||
    ''
  const displayedSecondExpertId =
    secondExpertId ||
    preferredExpertId(availableExperts, 'Blondeau & Cie') ||
    preferredExpertId(availableExperts, 'Blodneau & Cie') ||
    availableExperts.find((contact) => contact.id !== displayedFirstExpertId)?.id ||
    ''

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('fr')
    return artworks
      .filter((artwork) => {
        if (!normalizedQuery) return true
        return artworkLabel(artwork)
          .toLocaleLowerCase('fr')
          .includes(normalizedQuery)
      })
      .sort((first, second) => {
        return compareArtworks(first, second)
      })
  }, [artworks, query])

  const firstExpert =
    contacts.find((contact) => contact.id === displayedFirstExpertId) ?? null
  const secondExpert =
    contacts.find((contact) => contact.id === displayedSecondExpertId) ?? null

  const totalAcquisitionCost = useMemo(
    () =>
      rows.reduce((total, artwork) => total + (getTotalAcquisitionCost(artwork) ?? 0), 0),
    [rows]
  )

  const displayedArtworkIds = useMemo(
    () => new Set(rows.map((artwork) => artwork.id)),
    [rows]
  )

  const firstExpertYearlyTotals = useMemo(
    () =>
      displayedFirstExpertId
        ? valuationTotalsByYear(valuations, displayedArtworkIds, displayedFirstExpertId)
        : [],
    [displayedArtworkIds, displayedFirstExpertId, valuations]
  )
  const secondExpertYearlyTotals = useMemo(
    () =>
      displayedSecondExpertId
        ? valuationTotalsByYear(valuations, displayedArtworkIds, displayedSecondExpertId)
        : [],
    [displayedArtworkIds, displayedSecondExpertId, valuations]
  )
  const annualTotals = useMemo(() => {
    const acquisitionTotals = acquisitionTotalsByValuationYear(valuations, rows, [
      displayedFirstExpertId,
      displayedSecondExpertId,
    ])
    const firstTotals = new Map(
      firstExpertYearlyTotals.map(({ year, amounts }) => [year, amounts])
    )
    const secondTotals = new Map(
      secondExpertYearlyTotals.map(({ year, amounts }) => [year, amounts])
    )
    const years = new Set([
      ...acquisitionTotals.keys(),
      ...firstTotals.keys(),
      ...secondTotals.keys(),
    ])

    return [...years]
      .sort((firstYear, secondYear) => secondYear.localeCompare(firstYear))
      .map((year) => ({
        year,
        acquisitionTotal: acquisitionTotals.get(year) ?? 0,
        firstAmounts: firstTotals.get(year) ?? [],
        secondAmounts: secondTotals.get(year) ?? [],
      }))
  }, [
    displayedFirstExpertId,
    displayedSecondExpertId,
    firstExpertYearlyTotals,
    rows,
    secondExpertYearlyTotals,
    valuations,
  ])

  return (
    <div className="p-6 pt-20 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Historique des évaluations</h1>
          <p className="text-sm text-gray-600">
            Cinq dernières évaluations par expert et par œuvre.
          </p>
        </div>
        <Link className="edit-button no-print" href="/valuations">
          Saisir des évaluations
        </Link>
      </div>

      <div className="no-print grid gap-3 rounded border bg-gray-50 p-4 md:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Expert 1
          <select
            className="rounded border bg-white px-3 py-2"
            value={displayedFirstExpertId}
            onChange={(event) => setFirstExpertId(event.target.value)}
          >
            <option value="">Sélectionner un expert</option>
            {availableExperts.map((contact) => (
              <option key={contact.id} value={contact.id} disabled={contact.id === displayedSecondExpertId}>
                {contactLabel(contact)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Expert 2
          <select
            className="rounded border bg-white px-3 py-2"
            value={displayedSecondExpertId}
            onChange={(event) => setSecondExpertId(event.target.value)}
          >
            <option value="">Sélectionner un expert</option>
            {availableExperts.map((contact) => (
              <option key={contact.id} value={contact.id} disabled={contact.id === displayedFirstExpertId}>
                {contactLabel(contact)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Recherche
          <input
            className="rounded border bg-white px-3 py-2"
            placeholder="Œuvre, expert ou note"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>

      <div className="no-print">
        <button type="button" className="edit-button" onClick={() => window.print()}>
          Imprimer les évaluations
        </button>
      </div>

      {error && <p className="rounded border border-red-300 bg-red-50 p-3 text-red-800">{error}</p>}
      {loading ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : (
        <table className="valuations-history-table w-full border-collapse text-sm">
          <thead>
            <tr className="border-y bg-gray-50 text-left">
              <th className="p-3">Image</th>
              <th className="p-3">Date achat</th>
              <th className="p-3">Artiste</th>
              <th className="p-3">Titre, année</th>
              <th className="p-3 text-right">Total coût d&apos;acquisition</th>
              <th className="p-3">{firstExpert ? contactLabel(firstExpert) : 'Expert 1'}</th>
              <th className="p-3">{secondExpert ? contactLabel(secondExpert) : 'Expert 2'}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((artwork) => (
              <tr key={artwork.id} className="border-b align-top">
                <td className="p-3">
                  {artwork.image_url ? (
                    <img
                      src={artwork.image_url}
                      alt={artwork.title ?? 'Œuvre'}
                      className="h-12 w-12 rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded bg-gray-100 text-xs text-gray-400">
                      img
                    </div>
                  )}
                </td>
                <td className="p-3 whitespace-nowrap">{formatDate(artwork.date_acquisition ?? '')}</td>
                <td className="p-3">
                  {[artwork.artist?.first_name, artwork.artist?.last_name]
                    .filter(Boolean)
                    .join(' ') || '—'}
                </td>
                <td className="p-3">
                  {[artwork.title, artwork.year_execution].filter(Boolean).join(', ') || '—'}
                </td>
                <td className="p-3 text-right tabular-nums whitespace-nowrap">
                  {formatTotalAcquisitionCost(artwork)}
                </td>
                {[displayedFirstExpertId, displayedSecondExpertId].map((expertId, index) => {
                  const expertValuations = expertId
                    ? latestValuations(valuations, artwork.id, expertId)
                    : []
                  return (
                    <td key={expertId || index} className="p-3 tabular-nums">
                      {expertValuations.length > 0 ? (
                        <ul className="space-y-1 whitespace-nowrap">
                          {expertValuations.map((valuation) => (
                            <li key={valuation.id}>
                              {formatDate(valuation.valuation_date)} — {formatAmount(valuation.amount, valuation.currency)}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        '—'
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 bg-gray-50 align-top font-semibold">
                <td colSpan={4} className="p-3 text-right">
                  Total général
                </td>
                <td className="p-3 text-right tabular-nums whitespace-nowrap">
                  {formatAmount(totalAcquisitionCost, 'EUR')}
                </td>
                <td className="p-3 text-gray-500">Voir les totaux annuels ci-dessous</td>
                <td className="p-3 text-gray-500">Voir les totaux annuels ci-dessous</td>
              </tr>
              {annualTotals.map(
                ({ year, acquisitionTotal, firstAmounts, secondAmounts }) => (
                  <tr key={year} className="border-t bg-gray-50 align-top">
                    <td colSpan={4} className="p-3 text-right font-semibold">
                      Total {year}
                    </td>
                    <td className="p-3 text-right tabular-nums whitespace-nowrap font-semibold">
                      {formatAmount(acquisitionTotal, 'EUR')}
                    </td>
                    {[firstAmounts, secondAmounts].map((amounts, index) => (
                      <td key={index} className="p-3 tabular-nums font-normal">
                        {amounts.length > 0
                          ? amounts
                              .map(([currency, amount]) => formatAmount(amount, currency))
                              .join(' / ')
                          : '—'}
                      </td>
                    ))}
                  </tr>
                )
              )}
            </tfoot>
          )}
        </table>
      )}

      {!loading && rows.length === 0 && (
        <p className="py-6 text-center text-gray-500">Aucune évaluation trouvée.</p>
      )}
    </div>
  )
}
