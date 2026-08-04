'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx-js-style'

const THRESHOLD_USD = 5_000_000
const STANDARD_RATE = 0.08
const REDUCED_RATE = 0.07

type Company = 'Florac' | 'Léopold Meyer'

type Artwork = {
  id: string
  title: string | null
  medium: string | null
  provenance: string | null
  year_execution: number | null
  date_acquisition: string
  cost_amount: number
  cost_currency: string
  buyer: { company_name: string | null } | null
  artist: { first_name: string | null; last_name: string | null } | null
}

type FxRate = {
  rate_date: string
  from_currency: string
  to_currency: string
  rate: number
}

type CommissionRate = {
  artwork_id: string
  rate: number
}

type CommissionRow = Artwork & {
  company: Company
  year: string
  purchaseUsd: number | null
  exceptionalRate: number | null
  standardRate: number
  appliedRate: number
  commission: number
}

function normalize(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function companyForArtwork(artwork: Artwork): Company | null {
  const company = normalize(artwork.buyer?.company_name)
  if (company.includes('florac')) return 'Florac'
  if (company.includes('leopold meyer')) return 'Léopold Meyer'
  return null
}

function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  })
    .format(value)
    .replace(/,/g, "'")
}

function formatMoney(value: number | null, currency: string) {
  return value === null ? '—' : `${currency} ${formatNumber(value, 2)}`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('fr-CH').format(new Date(`${value.slice(0, 10)}T00:00:00`))
}

function artistLabel(artwork: Artwork) {
  return [artwork.artist?.last_name, artwork.artist?.first_name]
    .filter(Boolean)
    .join(' ')
}

function titleLabel(artwork: Artwork) {
  return [artwork.title, artwork.year_execution].filter(Boolean).join(', ')
}

function rateToUsd(
  currency: string,
  date: string,
  ratesByKey: Map<string, number>
) {
  if (currency === 'USD') return 1
  const isoDate = date.slice(0, 10)
  const directRate = ratesByKey.get(`${isoDate}:${currency}:USD`)
  if (directRate) return directRate

  const usdToEur = ratesByKey.get(`${isoDate}:USD:EUR`)
  if (!usdToEur) return null
  if (currency === 'EUR') return 1 / usdToEur

  const currencyToEur = ratesByKey.get(`${isoDate}:${currency}:EUR`)
  return currencyToEur ? currencyToEur / usdToEur : null
}

function exportWorkbook(rows: CommissionRow[], year: string, company: Company | 'Toutes') {
  const worksheet = XLSX.utils.aoa_to_sheet([
    [`Commissions Blondeau & Cie — ${company} — ${year}`],
    [],
    [
      'Date achat',
      'Société',
      'Artiste',
      'Titre',
      'Medium',
      'Provenance',
      'Prix achat',
      'Devise',
      'Prix achat USD',
      'Taux commission',
      'Commission',
      'Devise commission',
      'Taux exceptionnel',
    ],
    ...rows.map((row) => [
      formatDate(row.date_acquisition),
      row.company,
      artistLabel(row),
      titleLabel(row),
      row.medium ?? '',
      row.provenance ?? '',
      row.cost_amount,
      row.cost_currency,
      row.purchaseUsd ?? '',
      row.appliedRate,
      row.commission,
      row.cost_currency,
      row.exceptionalRate ?? '',
    ]),
    [],
    [
      'TOTAL',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      rows.reduce((sum, row) => sum + (row.purchaseUsd ?? 0), 0),
      '',
      rows.reduce((sum, row) => sum + row.commission, 0),
      '',
      '',
    ],
  ])

  worksheet['!cols'] = [
    { wch: 12 },
    { wch: 16 },
    { wch: 25 },
    { wch: 36 },
    { wch: 32 },
    { wch: 30 },
    { wch: 16 },
    { wch: 10 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
  ]
  worksheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 12 } }]

  for (let column = 0; column <= 12; column += 1) {
    const cell = XLSX.utils.encode_cell({ r: 2, c: column })
    worksheet[cell].s = {
      fill: { fgColor: { rgb: '006039' } },
      font: { color: { rgb: 'FFFFFF' }, bold: true },
      alignment: { horizontal: 'center' },
    }
  }
  ;['I', 'J', 'K', 'M'].forEach((column) => {
    for (let row = 3; row <= rows.length + 4; row += 1) {
      const cell = worksheet[`${column}${row}`]
      if (cell) cell.z = column === 'J' || column === 'M' ? '0.00%' : "#,##0.00"
    }
  })

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Commissions')
  XLSX.writeFile(workbook, `commissions-${company.toLowerCase().replace('é', 'e')}-${year}.xlsx`)
}

export default function CommissionsPage() {
  const [artworks, setArtworks] = useState<Artwork[]>([])
  const [fxRates, setFxRates] = useState<FxRate[]>([])
  const [exceptionalRates, setExceptionalRates] = useState<Record<string, number>>({})
  const [year, setYear] = useState('')
  const [company, setCompany] = useState<Company | 'Toutes'>('Toutes')
  const [draftRates, setDraftRates] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      const response = await fetch('/api/commissions')
      const payload = (await response.json()) as {
        artworks?: Artwork[]
        fxRates?: FxRate[]
        commissionRates?: CommissionRate[]
        error?: string
      }
      if (cancelled) return

      if (!response.ok) {
        setError(payload.error ?? 'Impossible de charger les commissions.')
      } else {
        setArtworks(payload.artworks ?? [])
        setFxRates(payload.fxRates ?? [])
        setExceptionalRates(
          Object.fromEntries(
            (payload.commissionRates ?? []).map((commissionRate) => [
              commissionRate.artwork_id,
              Number(commissionRate.rate),
            ])
          )
        )
      }
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const years = useMemo(
    () =>
      [...new Set(artworks.map((artwork) => artwork.date_acquisition.slice(0, 4)))].sort(
        (first, second) => second.localeCompare(first)
      ),
    [artworks]
  )

  const selectedYear = year || years[0] || String(new Date().getFullYear())

  const rows = useMemo(() => {
    const ratesByKey = new Map(
      fxRates.map((rate) => [
        `${rate.rate_date}:${rate.from_currency}:${rate.to_currency}`,
        Number(rate.rate),
      ])
    )
    const rateByArtworkId = exceptionalRates
    const annualArtworks = artworks
      .map((artwork) => {
        const artworkCompany = companyForArtwork(artwork)
        if (!artworkCompany || artwork.date_acquisition.slice(0, 4) !== selectedYear) return null
        const exceptionalRate = rateByArtworkId[artwork.id] ?? null
        const conversionRate = rateToUsd(
          artwork.cost_currency,
          artwork.date_acquisition,
          ratesByKey
        )
        return {
          ...artwork,
          company: artworkCompany,
          year: selectedYear,
          purchaseUsd: conversionRate === null ? null : artwork.cost_amount * conversionRate,
          exceptionalRate,
        }
      })
      .filter((artwork): artwork is NonNullable<typeof artwork> => artwork !== null)

    const qualifyingPurchaseTotal = annualArtworks.reduce(
      (sum, artwork) =>
        sum + (artwork.exceptionalRate === null ? artwork.purchaseUsd ?? 0 : 0),
      0
    )
    const standardRate =
      qualifyingPurchaseTotal > THRESHOLD_USD ? REDUCED_RATE : STANDARD_RATE

    return annualArtworks
      .filter((artwork) => company === 'Toutes' || artwork.company === company)
      .sort((first, second) => first.date_acquisition.localeCompare(second.date_acquisition))
      .map((artwork) => {
        const appliedRate = artwork.exceptionalRate ?? standardRate
        return {
          ...artwork,
          standardRate,
          appliedRate,
          commission: artwork.cost_amount * appliedRate,
        }
      })
  }, [artworks, company, exceptionalRates, fxRates, selectedYear])

  const annualQualifyingUsd = useMemo(() => {
    const ratesByKey = new Map(
      fxRates.map((rate) => [
        `${rate.rate_date}:${rate.from_currency}:${rate.to_currency}`,
        Number(rate.rate),
      ])
    )

    return artworks.reduce((sum, artwork) => {
      if (
        !companyForArtwork(artwork) ||
        artwork.date_acquisition.slice(0, 4) !== selectedYear ||
        exceptionalRates[artwork.id] !== undefined
      ) {
        return sum
      }

      const conversionRate = rateToUsd(
        artwork.cost_currency,
        artwork.date_acquisition,
        ratesByKey
      )
      return sum + (conversionRate === null ? 0 : artwork.cost_amount * conversionRate)
    }, 0)
  }, [artworks, exceptionalRates, fxRates, selectedYear])

  const standardRate = annualQualifyingUsd > THRESHOLD_USD ? REDUCED_RATE : STANDARD_RATE

  async function saveExceptionalRate(artworkId: string) {
    const value = draftRates[artworkId] ?? ''
    const rate = value.trim() === '' ? null : Number(value) / 100
    if (rate !== null && (!Number.isFinite(rate) || rate < 0 || rate > 1)) {
      setError('Le taux exceptionnel doit être compris entre 0 % et 100 %.')
      return
    }

    setError('')
    setSavingId(artworkId)
    try {
      const response = await fetch('/api/commissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artworkId, rate }),
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'Enregistrement impossible.')

      setExceptionalRates((previous) => {
        const next = { ...previous }
        if (rate === null) delete next[artworkId]
        else next[artworkId] = rate
        return next
      })
      setDraftRates((previous) => {
        const next = { ...previous }
        delete next[artworkId]
        return next
      })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Enregistrement impossible.')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="p-6 pt-20 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Commissions facturées</h1>
          <p className="text-sm text-gray-600">
            Florac et Léopold Meyer cumulés pour le seuil annuel de USD 5&apos;000&apos;000.
          </p>
        </div>
        <Link className="edit-button no-print" href="/inventory">
          Inventaire
        </Link>
      </div>

      <div className="no-print grid gap-3 rounded border bg-gray-50 p-4 md:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Année
          <select
            className="rounded border bg-white px-3 py-2"
            value={selectedYear}
            onChange={(event) => setYear(event.target.value)}
          >
            {years.map((availableYear) => (
              <option key={availableYear} value={availableYear}>
                {availableYear}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Société
          <select
            className="rounded border bg-white px-3 py-2"
            value={company}
            onChange={(event) => setCompany(event.target.value as Company | 'Toutes')}
          >
            <option>Toutes</option>
            <option>Florac</option>
            <option>Léopold Meyer</option>
          </select>
        </label>
        <div className="text-sm">
          <p className="font-medium">Cumul admissible annuel</p>
          <p className="text-lg font-semibold">{formatMoney(annualQualifyingUsd, 'USD')}</p>
          <p className="text-gray-600">Taux standard : {(standardRate * 100).toFixed(0)} %</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <button className="edit-button" type="button" onClick={() => exportWorkbook(rows, selectedYear, company)}>
            Exporter vers Excel
          </button>
          <button className="edit-button" type="button" onClick={() => window.print()}>
            Imprimer
          </button>
        </div>
      </div>

      {error && <p className="rounded border border-red-300 bg-red-50 p-3 text-red-800">{error}</p>}
      {loading ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : (
        <div className="overflow-x-auto rounded border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-gray-50 text-left">
              <tr className="border-b">
                <th className="p-3">Date achat</th>
                <th className="p-3">Société</th>
                <th className="p-3">Artiste</th>
                <th className="p-3">Titre</th>
                <th className="p-3">Provenance</th>
                <th className="p-3 text-right">Prix achat</th>
                <th className="p-3 text-right">Prix achat USD</th>
                <th className="p-3 text-right">Taux</th>
                <th className="p-3 text-right">Commission</th>
                <th className="p-3 no-print">Taux exceptionnel</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const draftRate =
                  draftRates[row.id] ??
                  (row.exceptionalRate === null ? '' : String(row.exceptionalRate * 100))
                return (
                  <tr key={row.id} className="border-b align-top">
                    <td className="p-3 whitespace-nowrap">{formatDate(row.date_acquisition)}</td>
                    <td className="p-3">{row.company}</td>
                    <td className="p-3 font-medium">{artistLabel(row) || '—'}</td>
                    <td className="p-3">
                      <p>{titleLabel(row) || '—'}</p>
                      {row.medium && <p className="text-xs text-gray-600">{row.medium}</p>}
                    </td>
                    <td className="p-3">{row.provenance ?? '—'}</td>
                    <td className="p-3 text-right tabular-nums">
                      {formatMoney(row.cost_amount, row.cost_currency)}
                    </td>
                    <td className={`p-3 text-right tabular-nums ${row.purchaseUsd === null ? 'text-red-700' : ''}`}>
                      {formatMoney(row.purchaseUsd, 'USD')}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {(row.appliedRate * 100).toFixed(2)} %
                      {row.exceptionalRate !== null && (
                        <p className="text-xs text-amber-700">exceptionnel</p>
                      )}
                    </td>
                    <td className="p-3 text-right font-medium tabular-nums">
                      {formatMoney(row.commission, row.cost_currency)}
                    </td>
                    <td className="p-3 no-print">
                      <div className="flex min-w-44 items-center gap-2">
                        <input
                          aria-label={`Taux exceptionnel pour ${titleLabel(row)}`}
                          className="w-20 rounded border px-2 py-1 text-right"
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          placeholder={`${(row.standardRate * 100).toFixed(0)} %`}
                          value={draftRate}
                          onChange={(event) =>
                            setDraftRates((previous) => ({
                              ...previous,
                              [row.id]: event.target.value,
                            }))
                          }
                        />
                        <span>%</span>
                        <button
                          className="edit-button"
                          type="button"
                          disabled={savingId === row.id}
                          onClick={() => void saveExceptionalRate(row.id)}
                        >
                          {savingId === row.id ? '…' : 'OK'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="border-t bg-gray-50 font-semibold">
              <tr>
                <td className="p-3" colSpan={6}>Total affiché</td>
                <td className="p-3 text-right tabular-nums">
                  {formatMoney(rows.reduce((sum, row) => sum + (row.purchaseUsd ?? 0), 0), 'USD')}
                </td>
                <td />
                <td className="p-3 text-right tabular-nums">
                  {Object.entries(
                    rows.reduce<Record<string, number>>((totals, row) => {
                      totals[row.cost_currency] = (totals[row.cost_currency] ?? 0) + row.commission
                      return totals
                    }, {})
                  ).map(([currency, amount]) => (
                    <p key={currency}>{formatMoney(amount, currency)}</p>
                  ))}
                </td>
                <td className="no-print" />
              </tr>
            </tfoot>
          </table>
          {rows.some((row) => row.purchaseUsd === null) && (
            <p className="p-3 text-sm text-red-700">
              Certains prix ne peuvent pas être convertis en USD : renseignez le taux de change de la date d’achat dans l’inventaire.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
