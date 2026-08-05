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
  year_execution: number | null
  date_acquisition: string
  cost_amount: number
  cost_currency: string
  auctions: boolean | null
  sold_hammer: number | null
  auction_currency: string | null
  buyer: {
    company_name: string | null
    first_name: string | null
    last_name: string | null
  } | null
  proposedBy: {
    company_name: string | null
    first_name: string | null
    last_name: string | null
  } | null
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

type Invoice = {
  artwork_id: string
  invoiced_at: string
  invoice_url: string | null
}

type CorrectionInvoice = {
  calendar_year: number
  company: Company
  invoiced_at: string
  invoice_url: string | null
}

type CommissionRow = Artwork & {
  company: Company
  year: string
  purchaseUsd: number | null
  exceptionalRate: number | null
  standardRate: number
  appliedRate: number
  commissionBase: number | null
  commissionCurrency: string
  commissionBaseUsd: number | null
  commission: number | null
  commissionUsd: number | null
  invoicedAt: string | null
  invoiceUrl: string | null
  isCorrectionApplied?: boolean
}

function normalize(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function companyForArtwork(artwork: Artwork): Company | null {
  const company = normalize(artwork.buyer?.company_name)
  const buyerName = `${normalize(artwork.buyer?.first_name)} ${normalize(
    artwork.buyer?.last_name
  )}`.trim()
  if (company.includes('florac')) return 'Florac'
  if (buyerName === 'leopold meyer') return 'Léopold Meyer'
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
  return value === null ? '—' : `${currency} ${formatNumber(value)}`
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

function contactLabel(contact: Artwork['proposedBy']) {
  return (
    contact?.company_name ||
    [contact?.first_name, contact?.last_name].filter(Boolean).join(' ') ||
    '—'
  )
}

function rateToUsd(
  currency: string,
  date: string,
  ratesByKey: Map<string, number>
) {
  if (currency === 'USD') return 1
  const isoDate = date.slice(0, 10)
  return ratesByKey.get(`${isoDate}:${currency}:USD`) ?? null
}

function exportWorkbook(rows: CommissionRow[], year: string, company: Company | 'Toutes') {
  const commissionTotals = Object.entries(
    rows.reduce<Record<string, number>>((totals, row) => {
      totals[row.commissionCurrency] =
        (totals[row.commissionCurrency] ?? 0) + (row.commission ?? 0)
      return totals
    }, {})
  )
  const worksheet = XLSX.utils.aoa_to_sheet([
    [`Commissions Blondeau & Cie — ${company} — ${year}`],
    [],
    [
      'Date achat',
      'Société',
      'Artiste',
      'Titre',
      'Medium',
      'Proposed by',
      'Prix achat',
      'Devise',
      'Prix achat USD',
      'Base commission',
      'Devise base',
      'FX vers USD',
      'Taux commission',
      'Commission',
      'Commission USD',
      'Devise commission',
      'Taux exceptionnel',
    ],
    ...rows.map((row) => [
      formatDate(row.date_acquisition),
      row.company,
      artistLabel(row),
      titleLabel(row),
      row.medium ?? '',
      contactLabel(row.proposedBy),
      row.cost_amount,
      row.cost_currency,
      row.purchaseUsd ?? '',
      row.commissionBase ?? '',
      row.commissionCurrency,
      row.commissionCurrency === 'USD'
        ? 1
        : row.commissionUsd === null || row.commission === null
          ? ''
          : row.commissionUsd / row.commission,
      row.appliedRate,
      row.commission ?? '',
      row.commissionUsd ?? '',
      row.commissionCurrency,
      row.exceptionalRate ?? '',
    ]),
    [],
    ...commissionTotals.map(([currency, amount], index) => [
      index === 0 ? 'TOTAL' : '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      index === 0 ? rows.reduce((sum, row) => sum + (row.purchaseUsd ?? 0), 0) : '',
      '',
      '',
      '',
      '',
      '',
      amount,
      currency,
      '',
    ]),
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
    { wch: 14 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
  ]
  worksheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 14 } }]

  for (let column = 0; column <= 14; column += 1) {
    const cell = XLSX.utils.encode_cell({ r: 2, c: column })
    worksheet[cell].s = {
      fill: { fgColor: { rgb: '006039' } },
      font: { color: { rgb: 'FFFFFF' }, bold: true },
      alignment: { horizontal: 'center' },
    }
  }
  ;['I', 'L', 'M', 'O'].forEach((column) => {
    for (let row = 3; row <= rows.length + 4; row += 1) {
      const cell = worksheet[`${column}${row}`]
      if (cell) cell.z = column === 'L' || column === 'O' ? '0.00%' : '#,##0'
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
  const [invoices, setInvoices] = useState<Record<string, Invoice>>({})
  const [correctionInvoices, setCorrectionInvoices] = useState<Record<string, CorrectionInvoice>>({})
  const [year, setYear] = useState('')
  const [company, setCompany] = useState<Company | 'Toutes'>('Toutes')
  const [draftRates, setDraftRates] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savingInvoiceId, setSavingInvoiceId] = useState<string | null>(null)
  const [draftInvoiceDates, setDraftInvoiceDates] = useState<Record<string, string>>({})
  const [draftInvoiceUrls, setDraftInvoiceUrls] = useState<Record<string, string>>({})
  const [draftCorrectionDates, setDraftCorrectionDates] = useState<Record<string, string>>({})
  const [draftCorrectionUrls, setDraftCorrectionUrls] = useState<Record<string, string>>({})
  const [shownCorrectionCompanies, setShownCorrectionCompanies] = useState<Company[]>([])
  const [draftFxRates, setDraftFxRates] = useState<Record<string, string>>({})
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      const response = await fetch('/api/commissions')
      const payload = (await response.json()) as {
        artworks?: Artwork[]
        fxRates?: FxRate[]
        commissionRates?: CommissionRate[]
        invoices?: Invoice[]
        correctionInvoices?: CorrectionInvoice[]
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
        setInvoices(
          Object.fromEntries(
            (payload.invoices ?? []).map((invoice) => [invoice.artwork_id, invoice])
          )
        )
        setCorrectionInvoices(
          Object.fromEntries(
            (payload.correctionInvoices ?? []).map((invoice) => [
              `${invoice.calendar_year}:${invoice.company}`,
              invoice,
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

  const annualRows = useMemo(() => {
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

    const orderedArtworks = annualArtworks
      .sort((first, second) => first.date_acquisition.localeCompare(second.date_acquisition))
    return orderedArtworks.map((artwork, index) => {
        const qualifyingPurchaseTotal = orderedArtworks
          .slice(0, index + 1)
          .reduce(
            (sum, item) =>
              sum + (item.exceptionalRate === null ? item.purchaseUsd ?? 0 : 0),
            0
          )
        const standardRate =
          qualifyingPurchaseTotal >= THRESHOLD_USD ? REDUCED_RATE : STANDARD_RATE
        const appliedRate = artwork.exceptionalRate ?? standardRate
        const isAuction = artwork.auctions === true
        const commissionBase =
          isAuction ? artwork.sold_hammer : artwork.cost_amount
        const commissionCurrency =
          isAuction ? artwork.auction_currency ?? artwork.cost_currency : artwork.cost_currency
        const commissionConversionRate = rateToUsd(
          commissionCurrency,
          artwork.date_acquisition,
          ratesByKey
        )
        return {
          ...artwork,
          standardRate,
          appliedRate,
          commissionBase,
          commissionCurrency,
          commissionBaseUsd:
            commissionBase === null || commissionConversionRate === null
              ? null
              : commissionBase * commissionConversionRate,
          commission: commissionBase === null ? null : commissionBase * appliedRate,
          commissionUsd:
            commissionBase === null || commissionConversionRate === null
              ? null
              : commissionBase * appliedRate * commissionConversionRate,
          invoicedAt: invoices[artwork.id]?.invoiced_at ?? null,
          invoiceUrl: invoices[artwork.id]?.invoice_url ?? null,
        }
      })
  }, [artworks, exceptionalRates, fxRates, invoices, selectedYear])

  const rows = useMemo(
    () => annualRows.filter((row) => company === 'Toutes' || row.company === company),
    [annualRows, company]
  )

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

  const invoicedRows = useMemo(
    () => rows.filter((row) => row.invoicedAt !== null),
    [rows]
  )

  const invoicedCommissionUsdTotal = useMemo(
    () => invoicedRows.reduce((sum, row) => sum + (row.commissionUsd ?? 0), 0),
    [invoicedRows]
  )

  const commissionBasesUsdByRate = useMemo(
    () =>
      [REDUCED_RATE, STANDARD_RATE].map((rate) => ({
        rate,
        amount: rows
          .filter((row) => row.appliedRate === rate)
          .reduce((sum, row) => sum + (row.commissionBaseUsd ?? 0), 0),
      })),
    [rows]
  )

  const commissionBaseTotalsByCurrency = useMemo(
    () =>
      Object.entries(
        rows.reduce<Record<string, number>>((totals, row) => {
          totals[row.commissionCurrency] =
            (totals[row.commissionCurrency] ?? 0) + (row.commissionBase ?? 0)
          return totals
        }, {})
      ),
    [rows]
  )

  const commissionBaseUsdTotal = useMemo(
    () => rows.reduce((sum, row) => sum + (row.commissionBaseUsd ?? 0), 0),
    [rows]
  )

  const correctionSummaries = useMemo(() => {
    if (annualQualifyingUsd < THRESHOLD_USD) return []

    return (['Florac', 'Léopold Meyer'] as const).map((correctionCompany) => {
      const amount = annualRows
        .filter(
          (row) =>
            row.company === correctionCompany &&
            row.exceptionalRate === null &&
            row.appliedRate === STANDARD_RATE &&
            row.invoicedAt !== null
        )
        .reduce((sum, row) => sum - (row.commissionBaseUsd ?? 0) * 0.01, 0)
      const key = `${selectedYear}:${correctionCompany}`
      return {
        company: correctionCompany,
        amount,
        invoicedAt: correctionInvoices[key]?.invoiced_at ?? null,
        invoiceUrl: correctionInvoices[key]?.invoice_url ?? null,
        key,
      }
    })
  }, [annualQualifyingUsd, annualRows, correctionInvoices, selectedYear])

  const displayedCorrections = useMemo(
    () =>
      correctionSummaries.filter(
        (correction) => company === 'Toutes' || correction.company === company
      ),
    [company, correctionSummaries]
  )

  const invoicedCorrectionUsdTotal = useMemo(
    () =>
      displayedCorrections.reduce(
        (sum, correction) => sum + (correction.invoicedAt ? correction.amount : 0),
        0
      ),
    [displayedCorrections]
  )

  const tableRows = useMemo<CommissionRow[]>(
    () =>
      rows.map((row) => {
        const isCorrectionShown =
          (shownCorrectionCompanies.includes(row.company) ||
            correctionInvoices[`${selectedYear}:${row.company}`]?.invoiced_at !== undefined) &&
          row.exceptionalRate === null &&
          row.appliedRate === STANDARD_RATE &&
          row.invoicedAt !== null &&
          row.commissionBase !== null

        if (!isCorrectionShown || row.commissionBase === null) return row

        return {
          ...row,
          appliedRate: REDUCED_RATE,
          commission: row.commissionBase * REDUCED_RATE,
          commissionUsd:
            row.commissionBaseUsd === null
              ? null
              : row.commissionBaseUsd * REDUCED_RATE,
          isCorrectionApplied: true,
        }
      }),
    [correctionInvoices, rows, selectedYear, shownCorrectionCompanies]
  )

  function correctionRowsForCompany(correctionCompany: Company) {
    return annualRows.filter(
      (row) =>
        row.company === correctionCompany &&
        row.exceptionalRate === null &&
        row.appliedRate === STANDARD_RATE &&
        row.invoicedAt !== null &&
        row.commissionBase !== null &&
        row.commissionBaseUsd !== null
    )
  }

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

  function fxKey(rateDate: string, fromCurrency: string) {
    return `${rateDate}:${fromCurrency}:USD`
  }

  function getFxRate(rateDate: string, fromCurrency: string) {
    return fxRates.find(
      (fxRate) =>
        fxRate.rate_date === rateDate &&
        fxRate.from_currency === fromCurrency &&
        fxRate.to_currency === 'USD'
    )
  }

  async function saveFxRate(rateDate: string, fromCurrency: string) {
    const key = fxKey(rateDate, fromCurrency)
    if (!Object.hasOwn(draftFxRates, key)) return

    const rate = Number(draftFxRates[key])
    if (!Number.isFinite(rate) || rate <= 0) {
      setError('Le taux de change doit être supérieur à zéro.')
      return
    }

    setError('')
    try {
      const response = await fetch('/api/commissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rateDate, fromCurrency, rate }),
      })
      const payload = (await response.json()) as { error?: string; fxRate?: FxRate }
      const savedFxRate = payload.fxRate
      if (!response.ok || !savedFxRate) {
        throw new Error(payload.error ?? 'Enregistrement du taux impossible.')
      }
      setFxRates((previous) => [
        ...previous.filter(
          (fxRate) =>
            !(
              fxRate.rate_date === rateDate &&
              fxRate.from_currency === fromCurrency &&
              fxRate.to_currency === 'USD'
            )
        ),
        savedFxRate,
      ])
      setDraftFxRates((previous) => {
        const next = { ...previous }
        delete next[key]
        return next
      })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Enregistrement impossible.')
    }
  }

  async function saveArtworkInvoice(artworkId: string, commissionAmount: number | null) {
    const invoicedAt = draftInvoiceDates[artworkId] ?? invoices[artworkId]?.invoiced_at
    if (!invoicedAt) return
    if (commissionAmount === null) {
      setError('La commission ne peut pas être calculée sans base de commission et taux de change.')
      return
    }
    const invoiceUrl = draftInvoiceUrls[artworkId] ?? invoices[artworkId]?.invoice_url ?? ''

    setError('')
    setSavingInvoiceId(artworkId)
    try {
      const response = await fetch('/api/commissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'artwork', artworkId, invoicedAt, invoiceUrl, commissionAmount }),
      })
      const payload = (await response.json()) as { error?: string; invoice?: Invoice }
      if (!response.ok || !payload.invoice) {
        throw new Error(payload.error ?? 'Enregistrement de la facture impossible.')
      }
      setInvoices((previous) => ({
        ...previous,
        [payload.invoice!.artwork_id]: payload.invoice!,
      }))
      setDraftInvoiceDates((previous) => {
        const next = { ...previous }
        delete next[artworkId]
        return next
      })
      setDraftInvoiceUrls((previous) => {
        const next = { ...previous }
        delete next[artworkId]
        return next
      })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Enregistrement impossible.')
    } finally {
      setSavingInvoiceId(null)
    }
  }

  async function saveCorrectionInvoice(
    correctionCompany: Company,
    key: string,
    correctionRows: CommissionRow[]
  ) {
    const invoicedAt =
      draftCorrectionDates[key] ?? correctionInvoices[key]?.invoiced_at
    if (!invoicedAt) return
    const invoiceUrl =
      draftCorrectionUrls[key] ?? correctionInvoices[key]?.invoice_url ?? ''

    setError('')
    try {
      const response = await fetch('/api/commissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'correction',
          calendarYear: Number(selectedYear),
          company: correctionCompany,
          invoicedAt,
          invoiceUrl,
          artworkCommissions: correctionRows.map((row) => ({
            artworkId: row.id,
            commissionAmount: row.commissionBase! * REDUCED_RATE,
          })),
        }),
      })
      const payload = (await response.json()) as {
        error?: string
        correctionInvoice?: CorrectionInvoice
      }
      if (!response.ok || !payload.correctionInvoice) {
        throw new Error(payload.error ?? 'Enregistrement de la correction impossible.')
      }
      setCorrectionInvoices((previous) => ({
        ...previous,
        [`${payload.correctionInvoice!.calendar_year}:${payload.correctionInvoice!.company}`]:
          payload.correctionInvoice!,
      }))
      setDraftCorrectionDates((previous) => {
        const next = { ...previous }
        delete next[key]
        return next
      })
      setDraftCorrectionUrls((previous) => {
        const next = { ...previous }
        delete next[key]
        return next
      })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Enregistrement impossible.')
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
      {displayedCorrections.length > 0 && (
        <section className="rounded border border-amber-300 bg-amber-50 p-4">
          <h2 className="font-semibold">Corrections de commissions à facturer</h2>
          <p className="mb-3 text-sm text-gray-700">
            Le seuil annuel de USD 5&apos;000&apos;000 est atteint. La correction correspond à −1 % des commissions à 8 % déjà facturées.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {displayedCorrections.map((correction) => {
              const dateValue =
                draftCorrectionDates[correction.key] ?? correction.invoicedAt ?? ''
              const invoiceUrl = draftCorrectionUrls[correction.key] ?? correction.invoiceUrl ?? ''
              const correctionRows = correctionRowsForCompany(correction.company)
              const showsCorrectionRows = shownCorrectionCompanies.includes(correction.company)
              return (
                <div key={correction.key} className="rounded border border-amber-200 bg-white p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-48">
                      <p className="font-medium">{correction.company}</p>
                      <p className="text-lg font-semibold">{formatMoney(correction.amount, 'USD')}</p>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      Facturée le
                      <input
                        className="rounded border px-2 py-1"
                        type="date"
                        value={dateValue}
                        onChange={(event) =>
                          setDraftCorrectionDates((previous) => ({
                            ...previous,
                            [correction.key]: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      PDF OneDrive
                      <input
                        aria-label={`Lien PDF de la correction ${correction.company}`}
                        className="w-56 rounded border px-2 py-1"
                        type="url"
                        placeholder="https://..."
                        value={invoiceUrl}
                        onChange={(event) =>
                          setDraftCorrectionUrls((previous) => ({
                            ...previous,
                            [correction.key]: event.target.value,
                          }))
                        }
                      />
                    </label>
                    {correction.invoiceUrl && (
                      <a
                        className="text-sm font-medium text-blue-700 underline"
                        href={correction.invoiceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        PDF
                      </a>
                    )}
                    <button
                      className="edit-button"
                      type="button"
                      disabled={!dateValue}
                      onClick={() =>
                        void saveCorrectionInvoice(
                          correction.company,
                          correction.key,
                          correctionRows
                        )
                      }
                    >
                      Enregistrer
                    </button>
                    <button
                      className="edit-button"
                      type="button"
                      onClick={() =>
                        setShownCorrectionCompanies((previous) =>
                          previous.includes(correction.company)
                            ? previous
                            : [...previous, correction.company]
                        )
                      }
                    >
                      Voir les œuvres à corriger ({correctionRows.length})
                    </button>
                    {showsCorrectionRows && (
                      <button
                        className="edit-button"
                        type="button"
                        onClick={() =>
                          setShownCorrectionCompanies((previous) =>
                            previous.filter((companyName) => companyName !== correction.company)
                          )
                        }
                      >
                        Annuler
                      </button>
                    )}
                  </div>
                  {showsCorrectionRows && (
                    <div className="mt-3 overflow-x-auto border-t pt-3">
                      <table className="w-full text-sm">
                        <thead className="text-left">
                          <tr>
                            <th className="pb-2 pr-3">Artiste</th>
                            <th className="pb-2 pr-3">Titre</th>
                            <th className="pb-2 text-right">Correction −1 % (devise)</th>
                            <th className="pb-2 text-right">Correction −1 % USD</th>
                            <th className="pb-2 text-right">Nouvelle commission 7 % (devise)</th>
                            <th className="pb-2 text-right">Nouvelle commission 7 % USD</th>
                          </tr>
                        </thead>
                        <tbody>
                          {correctionRows.map((row) => (
                            <tr key={row.id} className="border-t">
                              <td className="py-2 pr-3 font-medium">{artistLabel(row) || '—'}</td>
                              <td className="py-2 pr-3">{titleLabel(row) || '—'}</td>
                              <td className="py-2 text-right tabular-nums">
                                {formatMoney(-row.commissionBase! * 0.01, row.commissionCurrency)}
                              </td>
                              <td className="py-2 text-right tabular-nums">
                                {formatMoney(-row.commissionBaseUsd! * 0.01, 'USD')}
                              </td>
                              <td className="py-2 text-right tabular-nums font-medium">
                                {formatMoney(row.commissionBase! * REDUCED_RATE, row.commissionCurrency)}
                              </td>
                              <td className="py-2 text-right tabular-nums font-medium">
                                {formatMoney(row.commissionBaseUsd! * REDUCED_RATE, 'USD')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}
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
                <th className="p-3">Proposed by</th>
                <th className="p-3 text-right">Prix achat</th>
                <th className="p-3 text-right">Prix achat USD</th>
                <th className="p-3 text-right no-print">FX → USD</th>
                <th className="p-3 text-right">Base commission</th>
                <th className="p-3 text-right">Taux</th>
                <th className="p-3 text-right">Commission</th>
                <th className="p-3 no-print">Facturée le</th>
                <th className="p-3 no-print">Taux exceptionnel</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => {
                const draftRate =
                  draftRates[row.id] ??
                  (row.exceptionalRate === null ? '' : String(row.exceptionalRate * 100))
                const invoicedCommissionAmount =
                  annualRows.find((annualRow) => annualRow.id === row.id)?.commission ?? row.commission
                return (
                  <tr key={row.id} className="border-b align-top">
                    <td className="p-3 whitespace-nowrap">{formatDate(row.date_acquisition)}</td>
                    <td className="p-3">{row.company}</td>
                    <td className="p-3 font-medium">{artistLabel(row) || '—'}</td>
                    <td className="p-3">
                      <p>{titleLabel(row) || '—'}</p>
                      {row.medium && <p className="text-xs text-gray-600">{row.medium}</p>}
                    </td>
                    <td className="p-3">{contactLabel(row.proposedBy)}</td>
                    <td className="p-3 text-right tabular-nums">
                      {formatMoney(row.cost_amount, row.cost_currency)}
                    </td>
                    <td className={`p-3 text-right tabular-nums ${row.purchaseUsd === null ? 'text-red-700' : ''}`}>
                      {formatMoney(row.purchaseUsd, 'USD')}
                    </td>
                    <td className="p-3 no-print">
                      {(() => {
                        const rateDate = row.date_acquisition.slice(0, 10)
                        const key = fxKey(rateDate, row.cost_currency)
                        const existingRate = getFxRate(rateDate, row.cost_currency)
                        return row.cost_currency === 'USD' ? (
                          <span className="text-sm">1.0000</span>
                        ) : (
                          <input
                            aria-label={`Taux ${row.cost_currency} vers USD du ${rateDate}`}
                            className="w-24 rounded border px-2 py-1 text-right"
                            type="number"
                            min="0"
                            step="0.0001"
                            placeholder="taux"
                            value={draftFxRates[key] ?? (existingRate ? String(existingRate.rate) : '')}
                            onChange={(event) =>
                              setDraftFxRates((previous) => ({
                                ...previous,
                                [key]: event.target.value,
                              }))
                            }
                            onBlur={() => void saveFxRate(rateDate, row.cost_currency)}
                          />
                        )
                      })()}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {formatMoney(row.commissionBase, row.commissionCurrency)}
                      {row.auctions && (
                        <p className={`text-xs ${row.sold_hammer === null ? 'text-red-700' : 'text-gray-600'}`}>
                          {row.sold_hammer === null ? 'hammer price manquant' : 'hammer price'}
                        </p>
                      )}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {(row.appliedRate * 100).toFixed(2)} %
                      {row.exceptionalRate !== null && (
                        <p className="text-xs text-amber-700">exceptionnel</p>
                      )}
                      {row.isCorrectionApplied && (
                        <p className="text-xs text-green-700">corrigée à 7 %</p>
                      )}
                    </td>
                    <td className="p-3 text-right font-medium tabular-nums">
                      {formatMoney(row.commission, row.commissionCurrency)}
                      <p className={`text-xs ${row.commissionUsd === null ? 'text-red-700' : 'text-gray-600'}`}>
                        {formatMoney(row.commissionUsd, 'USD')}
                      </p>
                      {row.invoiceUrl && (
                        <a
                          className="text-xs font-medium text-blue-700 underline"
                          href={row.invoiceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Facture PDF
                        </a>
                      )}
                    </td>
                    <td className="p-3 no-print">
                      <div className="flex min-w-56 flex-col gap-2">
                        <input
                          aria-label={`Date de facture pour ${titleLabel(row)}`}
                          className="rounded border px-2 py-1"
                          type="date"
                          value={draftInvoiceDates[row.id] ?? row.invoicedAt ?? ''}
                          onChange={(event) =>
                            setDraftInvoiceDates((previous) => ({
                              ...previous,
                              [row.id]: event.target.value,
                            }))
                          }
                          onBlur={() => void saveArtworkInvoice(row.id, invoicedCommissionAmount)}
                        />
                        <div className="flex items-center gap-2">
                          <input
                            aria-label={`Lien PDF de la facture pour ${titleLabel(row)}`}
                            className="w-40 rounded border px-2 py-1"
                            type="url"
                            placeholder="Lien PDF OneDrive"
                            value={draftInvoiceUrls[row.id] ?? row.invoiceUrl ?? ''}
                            onChange={(event) =>
                              setDraftInvoiceUrls((previous) => ({
                                ...previous,
                                [row.id]: event.target.value,
                              }))
                            }
                            onBlur={() => void saveArtworkInvoice(row.id, invoicedCommissionAmount)}
                          />
                          {row.invoiceUrl && (
                            <a
                              className="text-sm font-medium text-blue-700 underline"
                              href={row.invoiceUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              PDF
                            </a>
                          )}
                        </div>
                      </div>
                      {savingInvoiceId === row.id && <span className="ml-1">…</span>}
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
                <td className="p-3" colSpan={6}>Total facturé</td>
                <td />
                <td className="no-print" />
                <td className="p-3 text-right tabular-nums">
                  <p className="text-xs text-gray-600">Total bases commissions</p>
                  {commissionBaseTotalsByCurrency.map(([currency, amount]) => (
                    <p key={currency}>{formatMoney(amount, currency)}</p>
                  ))}
                  <p className="border-t pt-1">{formatMoney(commissionBaseUsdTotal, 'USD')}</p>
                </td>
                <td />
                <td className="p-3 text-right tabular-nums">
                  {Object.entries(
                    invoicedRows.reduce<Record<string, number>>((totals, row) => {
                      totals[row.commissionCurrency] =
                        (totals[row.commissionCurrency] ?? 0) + (row.commission ?? 0)
                      return totals
                    }, {})
                  ).map(([currency, amount]) => (
                    <p key={currency}>{formatMoney(amount, currency)}</p>
                  ))}
                  <p className="border-t pt-1">
                    {formatMoney(invoicedCommissionUsdTotal + invoicedCorrectionUsdTotal, 'USD')}
                  </p>
                </td>
                <td className="no-print" />
                <td className="no-print" />
              </tr>
              {commissionBasesUsdByRate.map(({ rate, amount }) => (
                <tr key={rate}>
                  <td className="p-3" colSpan={8}>
                    Base commissions au taux de {(rate * 100).toFixed(0)} %
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {formatMoney(amount, 'USD')}
                  </td>
                  <td className="p-3 text-right">{(rate * 100).toFixed(0)} %</td>
                  <td />
                  <td className="no-print" />
                  <td className="no-print" />
                </tr>
              ))}
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
