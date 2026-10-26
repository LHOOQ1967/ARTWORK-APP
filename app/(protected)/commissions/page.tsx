'use client'

import { formatArtworkYears } from '@/lib/artworkYears'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { printCommissionCorrections } from '@/lib/printCommissionCorrections'
import * as XLSX from 'xlsx-js-style'
import { fetchWithAuth } from '@/lib/fetchWithAuth'
import { useClientFilter } from '@/contexts/ClientFilterContext'
import CommissionInvoiceFileInput from '@/components/CommissionInvoiceFileInput'

const THRESHOLD_USD = 5_000_000
const STANDARD_RATE = 0.08
const REDUCED_RATE = 0.07

type Company = 'Florac' | 'Léopold Meyer'

const DISPLAY_CURRENCIES = ['USD', 'GBP', 'EUR'] as const

type Artwork = {
  id: string
  title: string | null
  medium: string | null
  year_execution: number | null
  year_execution_start?: number | null
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
  originalCommission?: number | null
  originalCommissionUsd?: number | null
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

function totalsByCurrencyWithDefaults(totals: Record<string, number>) {
  const preferred = DISPLAY_CURRENCIES.map(
    (currency) => [currency, totals[currency] ?? 0] as const
  )
  const others = Object.entries(totals).filter(
    ([currency]) =>
      !DISPLAY_CURRENCIES.includes(currency as (typeof DISPLAY_CURRENCIES)[number])
  )
  return [...preferred, ...others]
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB').format(new Date(`${value.slice(0, 10)}T00:00:00`))
}

function artistLabel(artwork: Artwork) {
  return [artwork.artist?.last_name, artwork.artist?.first_name]
    .filter(Boolean)
    .join(' ')
}

function titleLabel(artwork: Artwork) {
  return [artwork.title, formatArtworkYears(artwork.year_execution, artwork.year_execution_start)].filter(Boolean).join(', ')
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
    [`Blondeau & Cie commissions — ${company === 'Toutes' ? 'All companies' : company} — ${year}`],
    [],
    [
      'Purchase date',
      'Buyer',
      'Artist',
      'Title',
      'Medium',
      'Proposed by',
      'Purchase price',
      'Currency',
      'Purchase price USD',
      'Commission base',
      'Base currency',
      'FX to USD',
      'Commission rate',
      'Commission',
      'Commission USD',
      'Commission currency',
      'Exceptional rate',
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
  const companyFileLabel = company === 'Toutes' ? 'all' : company.toLowerCase().replace('é', 'e')
  XLSX.writeFile(workbook, `commissions-${companyFileLabel}-${year}.xlsx`)
}

export default function CommissionsPage() {
  const { matchesClient, isFilterActive: isClientFilterActive } = useClientFilter()
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
  const [draftInvoiceFiles, setDraftInvoiceFiles] = useState<Record<string, File | undefined>>({})
  const [draftCorrectionDates, setDraftCorrectionDates] = useState<Record<string, string>>({})
  const [draftCorrectionFiles, setDraftCorrectionFiles] = useState<Record<string, File | undefined>>({})
  const [shownCorrectionCompanies, setShownCorrectionCompanies] = useState<Company[]>([])
  const [draftFxRates, setDraftFxRates] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [printingCorrectionCompany, setPrintingCorrectionCompany] = useState<Company | null>(null)
  const correctionTables = useRef<Partial<Record<Company, HTMLTableElement>>>({})
  const commissionsTable = useRef<HTMLTableElement>(null)
  const [printingCommissions, setPrintingCommissions] = useState(false)

  async function printCommissions(calendarYear: string) {
    if (!commissionsTable.current) return
    setPrintingCommissions(true)
    try {
      await printCommissionCorrections(
        commissionsTable.current,
        `Commissions — ${company === 'Toutes' ? 'All companies' : company} — ${calendarYear}`,
        true
      )
    } catch (printError) {
      setError(printError instanceof Error ? printError.message : 'Unable to print commissions.')
    } finally {
      setPrintingCommissions(false)
    }
  }

  async function printCorrections(correctionCompany: Company, calendarYear: string) {
    flushSync(() => setPrintingCorrectionCompany(correctionCompany))
    try {
      const table = correctionTables.current[correctionCompany]
      if (!table) throw new Error('Unable to find the correction table to print.')
      await printCommissionCorrections(
        table,
        `Correction commissions — ${correctionCompany === 'Florac' ? 'Florac Works' : correctionCompany} — ${calendarYear}`
      )
    } catch (printError) {
      setError(printError instanceof Error ? printError.message : 'Unable to print commission corrections.')
    } finally {
      setPrintingCorrectionCompany(null)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      const response = await fetchWithAuth('/api/commissions')
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
        setError(payload.error ?? 'Unable to load commissions.')
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
    () =>
      annualRows.filter(
        (row) => (company === 'Toutes' || row.company === company) && matchesClient(row.id)
      ),
    [annualRows, company, matchesClient]
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

  const invoicedCommissionTotalsByCurrency = useMemo(
    () =>
      totalsByCurrencyWithDefaults(
        invoicedRows.reduce<Record<string, number>>((totals, row) => {
          totals[row.commissionCurrency] =
            (totals[row.commissionCurrency] ?? 0) + (row.commission ?? 0)
          return totals
        }, {})
      ),
    [invoicedRows]
  )

  const commissionsToInvoiceRows = useMemo(
    () => rows.filter((row) => row.invoicedAt === null),
    [rows]
  )

  const commissionsToInvoiceUsdTotal = useMemo(
    () =>
      commissionsToInvoiceRows.reduce(
        (sum, row) => sum + (row.commissionUsd ?? 0),
        0
      ),
    [commissionsToInvoiceRows]
  )

  const commissionsToInvoiceTotalsByCurrency = useMemo(
    () =>
      totalsByCurrencyWithDefaults(
        commissionsToInvoiceRows.reduce<Record<string, number>>((totals, row) => {
          totals[row.commissionCurrency] =
            (totals[row.commissionCurrency] ?? 0) + (row.commission ?? 0)
          return totals
        }, {})
      ),
    [commissionsToInvoiceRows]
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
        (correction) =>
          (company === 'Toutes' || correction.company === company) &&
          (!isClientFilterActive || rows.some((row) => row.company === correction.company))
      ),
    [company, correctionSummaries, isClientFilterActive, rows]
  )

  const invoicedCorrectionUsdTotal = useMemo(
    () =>
      displayedCorrections.reduce(
        (sum, correction) => sum + (correction.invoicedAt ? correction.amount : 0),
        0
      ),
    [displayedCorrections]
  )

  const hasInvoicedCorrections = displayedCorrections.some(
    (correction) => correction.invoicedAt !== null
  )

  const invoicedTotalAfterCorrectionsUsd =
    invoicedCommissionUsdTotal + invoicedCorrectionUsdTotal

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
          originalCommission: row.commission,
          originalCommissionUsd: row.commissionUsd,
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

  const invoicedTotalsAfterCorrectionsByCurrency = useMemo(
    () =>
      totalsByCurrencyWithDefaults(
        tableRows
          .filter((row) => row.invoicedAt !== null)
          .reduce<Record<string, number>>((totals, row) => {
            totals[row.commissionCurrency] =
              (totals[row.commissionCurrency] ?? 0) + (row.commission ?? 0)
            return totals
          }, {})
      ),
    [tableRows]
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
    const enteredRate = value.trim() === '' ? null : Number(value) / 100
    if (
      enteredRate !== null &&
      (!Number.isFinite(enteredRate) || enteredRate < 0 || enteredRate > 1)
    ) {
      setError('The exceptional rate must be between 0% and 100%.')
      return
    }

    const row = annualRows.find((annualRow) => annualRow.id === artworkId)
    const rate = enteredRate === row?.standardRate ? null : enteredRate

    setError('')
    setSavingId(artworkId)
    try {
      const response = await fetchWithAuth('/api/commissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artworkId, rate }),
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'Unable to save.')

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
      setError(saveError instanceof Error ? saveError.message : 'Unable to save.')
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
      setError('The exchange rate must be greater than zero.')
      return
    }

    setError('')
    try {
      const response = await fetchWithAuth('/api/commissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rateDate, fromCurrency, rate }),
      })
      const payload = (await response.json()) as { error?: string; fxRate?: FxRate }
      const savedFxRate = payload.fxRate
      if (!response.ok || !savedFxRate) {
        throw new Error(payload.error ?? 'Unable to save the exchange rate.')
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
      setError(saveError instanceof Error ? saveError.message : 'Unable to save.')
    }
  }

  async function saveArtworkInvoice(artworkId: string, commissionAmount: number | null) {
    if (savingInvoiceId) return
    const hasDraftDate = Object.hasOwn(draftInvoiceDates, artworkId)
    const invoicedAt = hasDraftDate
      ? draftInvoiceDates[artworkId]
      : invoices[artworkId]?.invoiced_at
    if (!invoicedAt) {
      if (draftInvoiceFiles[artworkId] || !invoices[artworkId]) {
        setError('Choose an invoice date before saving an invoice file.')
        return
      }

      setError('')
      setSavingInvoiceId(artworkId)
      try {
        const response = await fetchWithAuth('/api/commissions', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'artwork', artworkId }),
        })
        const payload = (await response.json()) as { error?: string }
        if (!response.ok) {
          throw new Error(payload.error ?? 'Unable to delete the invoice.')
        }
        setInvoices((previous) => {
          const next = { ...previous }
          delete next[artworkId]
          return next
        })
        setDraftInvoiceDates((previous) => {
          const next = { ...previous }
          delete next[artworkId]
          return next
        })
        setDraftInvoiceFiles((previous) => {
          const next = { ...previous }
          delete next[artworkId]
          return next
        })
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : 'Unable to delete.')
      } finally {
        setSavingInvoiceId(null)
      }
      return
    }
    if (commissionAmount === null) {
      setError('The commission cannot be calculated without a commission base and exchange rate.')
      return
    }
    const invoiceUrl = invoices[artworkId]?.invoice_url ?? ''
    const file = draftInvoiceFiles[artworkId]
    const invoice = { kind: 'artwork', artworkId, invoicedAt, invoiceUrl, commissionAmount }
    const form = new FormData()
    if (file) {
      form.append('file', file)
      form.append('invoice', JSON.stringify(invoice))
    }

    setError('')
    setSavingInvoiceId(artworkId)
    try {
      const response = await fetchWithAuth('/api/commissions', {
        method: 'POST',
        headers: file ? undefined : { 'Content-Type': 'application/json' },
        body: file ? form : JSON.stringify(invoice),
      })
      const payload = (await response.json()) as { error?: string; invoice?: Invoice }
      if (!response.ok || !payload.invoice) {
        throw new Error(payload.error ?? 'Unable to save the invoice.')
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
      setDraftInvoiceFiles((previous) => {
        const next = { ...previous }
        delete next[artworkId]
        return next
      })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save.')
    } finally {
      setSavingInvoiceId(null)
    }
  }

  async function saveCorrectionInvoice(
    correctionCompany: Company,
    key: string,
    correctionRows: CommissionRow[]
  ) {
    if (savingInvoiceId) return
    const invoicedAt =
      draftCorrectionDates[key] ?? correctionInvoices[key]?.invoiced_at
    if (!invoicedAt) return
    const invoiceUrl = correctionInvoices[key]?.invoice_url ?? ''
    const file = draftCorrectionFiles[key]
    const invoice = {
      kind: 'correction',
      calendarYear: Number(selectedYear),
      company: correctionCompany,
      invoicedAt,
      invoiceUrl,
      artworkCommissions: correctionRows.map((row) => ({
        artworkId: row.id,
        commissionAmount: row.commissionBase! * REDUCED_RATE,
      })),
    }
    const form = new FormData()
    if (file) {
      form.append('file', file)
      form.append('invoice', JSON.stringify(invoice))
    }

    setError('')
    setSavingInvoiceId(key)
    try {
      const response = await fetchWithAuth('/api/commissions', {
        method: 'POST',
        headers: file ? undefined : { 'Content-Type': 'application/json' },
        body: file ? form : JSON.stringify(invoice),
      })
      const payload = (await response.json()) as {
        error?: string
        correctionInvoice?: CorrectionInvoice
      }
      if (!response.ok || !payload.correctionInvoice) {
        throw new Error(payload.error ?? 'Unable to save the correction.')
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
      setDraftCorrectionFiles((previous) => {
        const next = { ...previous }
        delete next[key]
        return next
      })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save.')
    } finally {
      setSavingInvoiceId(null)
    }
  }

  return (
    <div className="p-6 pt-20 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Invoiced commissions</h1>
          <p className="text-sm text-gray-600">
            Florac and Léopold Meyer are combined for the annual USD 5&apos;000&apos;000 threshold.
          </p>
        </div>
        <Link className="edit-button no-print" href="/inventory">
          Inventory
        </Link>
      </div>

      <div className="no-print grid gap-3 rounded border bg-gray-50 p-4 md:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Year
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
          Company
          <select
            className="rounded border bg-white px-3 py-2"
            value={company}
            onChange={(event) => setCompany(event.target.value as Company | 'Toutes')}
          >
            <option value="Toutes">All companies</option>
            <option>Florac</option>
            <option>Léopold Meyer</option>
          </select>
        </label>
        <div className="text-sm">
          <p className="font-medium">Annual qualifying total</p>
          <p className="text-lg font-semibold">{formatMoney(annualQualifyingUsd, 'USD')}</p>
          <p className="text-gray-600">Standard rate: {(standardRate * 100).toFixed(0)} %</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <button className="edit-button" type="button" onClick={() => exportWorkbook(rows, selectedYear, company)}>
            Export to Excel
          </button>
          <button className="edit-button" type="button" disabled={loading || printingCommissions} onClick={() => void printCommissions(selectedYear)}>
            {printingCommissions ? 'Preparing print...' : 'Print'}
          </button>
        </div>
      </div>

      {error && <p className="rounded border border-red-300 bg-red-50 p-3 text-red-800">{error}</p>}
      {displayedCorrections.length > 0 && (
        <section className="rounded border border-amber-300 bg-amber-50 p-4">
          <h2 className="font-semibold">Commission corrections to invoice</h2>
          <p className="mb-3 text-sm text-gray-700">
            The annual USD 5&apos;000&apos;000 threshold has been reached. The correction reduces already invoiced 8% commissions by one percentage point.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {displayedCorrections.map((correction) => {
              const dateValue =
                draftCorrectionDates[correction.key] ?? correction.invoicedAt ?? ''
              const correctionRows = correctionRowsForCompany(correction.company)
              const correctionUsdTotal = correctionRows.reduce(
                (total, row) => total - row.commissionBaseUsd! * 0.01,
                0
              )
              const newCommissionUsdTotal = correctionRows.reduce(
                (total, row) => total + row.commissionBaseUsd! * REDUCED_RATE,
                0
              )
              const originalCommissionUsdTotal = correctionRows.reduce(
                (total, row) => total + row.commissionBaseUsd! * STANDARD_RATE,
                0
              )
              const showsCorrectionRows = shownCorrectionCompanies.includes(correction.company)
              return (
                <div
                  key={correction.key}
                  className="rounded border border-amber-200 bg-white p-3"
                >
                  <button
                    className="edit-button no-print mb-3"
                    type="button"
                    disabled={correctionRows.length === 0 || savingInvoiceId !== null || printingCorrectionCompany !== null}
                    onClick={() => void printCorrections(correction.company, selectedYear)}
                  >
                    Print {correction.company}
                  </button>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-48">
                      <p className="font-medium">{correction.company}</p>
                      <p className="text-lg font-semibold">{formatMoney(correction.amount, 'USD')}</p>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      Invoiced on
                      <input
                        className="rounded border px-2 py-1"
                        type="date"
                        disabled={savingInvoiceId !== null}
                        value={dateValue}
                        onChange={(event) =>
                          setDraftCorrectionDates((previous) => ({
                            ...previous,
                            [correction.key]: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <CommissionInvoiceFileInput
                      label={`Correction invoice file for ${correction.company}`}
                      file={draftCorrectionFiles[correction.key]}
                      disabled={savingInvoiceId !== null}
                      onChange={file => setDraftCorrectionFiles(previous => ({
                        ...previous, [correction.key]: file,
                      }))}
                    />
                    {correction.invoiceUrl && (
                      <a
                        className="text-sm font-medium text-blue-700 underline"
                        data-print-exclude
                        href={correction.invoiceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open invoice
                      </a>
                    )}
                    <button
                      className="edit-button"
                      type="button"
                      disabled={!dateValue || savingInvoiceId !== null}
                      onClick={() =>
                        void saveCorrectionInvoice(
                          correction.company,
                          correction.key,
                          correctionRows
                        )
                      }
                    >
                      {savingInvoiceId === correction.key ? 'Saving...' : 'Save'}
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
                      View artworks to correct ({correctionRows.length})
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
                        Hide details
                      </button>
                    )}
                  </div>
                  {(showsCorrectionRows || printingCorrectionCompany === correction.company) && (
                    <div className={`${showsCorrectionRows ? '' : 'hidden '}mt-3 overflow-x-auto border-t pt-3 correction-details`}>
                      <table
                        className="w-full text-sm"
                        ref={table => {
                          if (table) correctionTables.current[correction.company] = table
                          else delete correctionTables.current[correction.company]
                        }}
                      >
                        <thead className="text-left">
                          <tr>
                            <th className="pb-2 pr-3 text-left">Purchase date</th>
                            <th className="pb-2 pr-3">Artist</th>
                            <th className="pb-2 pr-3">Title</th>
                            <th className="pb-2 text-right">Rate</th>
                            <th className="pb-2 text-right">Commissions (currency)</th>
                            <th className="pb-2 text-right">Commissions USD</th>
                            <th className="pb-2 text-right">Correction −1 % USD</th>
                          </tr>
                        </thead>
                        <tbody>
                          {correctionRows.map((row) => (
                            <tr key={row.id} className="border-t">
                              <td className="py-2 pr-3 text-left whitespace-nowrap">
                                {formatDate(row.date_acquisition)}
                              </td>
                              <td className="py-2 pr-3 font-medium">
                                {artistLabel(row) ? (
                                  <Link className="underline" href={`/artworks/print/${row.id}`}>
                                    {artistLabel(row)}
                                  </Link>
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td className="py-2 pr-3">{titleLabel(row) || '—'}</td>
                              <td className="py-2 text-right tabular-nums">
                                <p><del>{(STANDARD_RATE * 100).toFixed(0)} %</del></p>
                                <p className="font-bold text-green-700">{(REDUCED_RATE * 100).toFixed(0)} %</p>
                              </td>
                              <td className="py-2 text-right tabular-nums">
                                <p><del>{formatMoney(row.commissionBase! * STANDARD_RATE, row.commissionCurrency)}</del></p>
                                <p className="font-bold text-green-700">
                                  {formatMoney(row.commissionBase! * REDUCED_RATE, row.commissionCurrency)}
                                </p>
                              </td>
                              <td className="py-2 text-right tabular-nums">
                                <p><del>{formatMoney(row.commissionBaseUsd! * STANDARD_RATE, 'USD')}</del></p>
                                <p className="font-bold text-green-700">
                                  {formatMoney(row.commissionBaseUsd! * REDUCED_RATE, 'USD')}
                                </p>
                              </td>
                              <td className="py-2 text-right tabular-nums font-bold text-red-700">
                                {formatMoney(-row.commissionBaseUsd! * 0.01, 'USD')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="border-t font-semibold">
                          <tr>
                            <th scope="row" colSpan={5} className="py-2 pr-3 text-left">Total</th>
                            <td className="py-2 text-right tabular-nums">
                              <p><del>{formatMoney(originalCommissionUsdTotal, 'USD')}</del></p>
                              <p className="font-bold text-green-700">{formatMoney(newCommissionUsdTotal, 'USD')}</p>
                            </td>
                            <td className="py-2 text-right tabular-nums font-bold text-red-700">
                              {formatMoney(correctionUsdTotal, 'USD')}
                            </td>
                          </tr>
                        </tfoot>
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
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded border">
          <table className="w-full border-collapse text-sm" ref={commissionsTable}>
            <thead className="bg-gray-50 text-left">
              <tr className="border-b">
                <th className="p-3">Purchase date</th>
                <th className="p-3">
                  <p>Proposed by</p>
                  <p className="italic font-bold">Buyer</p>
                </th>
                <th className="p-3">Artist</th>
                <th className="p-3">Title</th>
                <th className="p-3 text-right">Purchase price</th>
                <th className="p-3 text-right">Purchase price USD</th>
                <th className="p-3 text-right no-print">FX → USD</th>
                <th className="p-3 text-right">Commission base</th>
                <th className="p-3 text-right">Rate</th>
                <th className="p-3 text-right">Commission</th>
                <th className="p-3 no-print">Invoiced on</th>
                <th className="p-3 no-print">Exceptional rate</th>
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
                    <td className="p-3">
                      <p>{contactLabel(row.proposedBy)}</p>
                      <p className="italic font-bold">{row.company}</p>
                    </td>
                    <td className="p-3 font-medium">
                      {artistLabel(row) ? (
                        <Link className="underline" href={`/artworks/print/${row.id}`}>
                          {artistLabel(row)}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="p-3">
                      <p>{titleLabel(row) || '—'}</p>
                      {row.medium && <p className="text-xs text-gray-600">{row.medium}</p>}
                    </td>
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
                            aria-label={`${row.cost_currency} to USD exchange rate on ${rateDate}`}
                            className="w-24 rounded border px-2 py-1 text-right"
                            type="number"
                            min="0"
                            step="0.0001"
                            placeholder="rate"
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
                          {row.sold_hammer === null ? 'missing hammer price' : 'hammer price'}
                        </p>
                      )}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {row.isCorrectionApplied ? (
                        <>
                          <del>{(STANDARD_RATE * 100).toFixed(2)} %</del>
                          <p className="text-xs" aria-hidden="true">&nbsp;</p>
                          <p className="font-bold text-green-700">7 %</p>
                        </>
                      ) : (
                        <>{(row.appliedRate * 100).toFixed(2)} %</>
                      )}
                      {row.exceptionalRate !== null && (
                        <p className="text-xs text-amber-700">exceptional</p>
                      )}
                    </td>
                    <td className="p-3 text-right font-medium tabular-nums">
                      {row.isCorrectionApplied ? (
                        <>
                          <div className="text-gray-600">
                            <p><del>{formatMoney(row.originalCommission ?? null, row.commissionCurrency)}</del></p>
                            <p className="text-xs"><del>{formatMoney(row.originalCommissionUsd ?? null, 'USD')}</del></p>
                          </div>
                          <div className="font-bold text-green-700">
                            <p>{formatMoney(row.commission, row.commissionCurrency)}</p>
                            <p className="text-xs">{formatMoney(row.commissionUsd, 'USD')}</p>
                          </div>
                          <p className="text-xs font-bold text-red-700">
                            {formatMoney(
                              row.originalCommissionUsd == null || row.commissionUsd === null
                                ? null
                                : row.originalCommissionUsd - row.commissionUsd,
                              'USD'
                            )}
                          </p>
                        </>
                      ) : (
                        <>
                          {formatMoney(row.commission, row.commissionCurrency)}
                          <p className={`text-xs ${row.commissionUsd === null ? 'text-red-700' : 'text-gray-600'}`}>
                            {formatMoney(row.commissionUsd, 'USD')}
                          </p>
                        </>
                      )}
                    </td>
                    <td className="p-3 no-print">
                      <input
                        aria-label={`Invoice date for ${titleLabel(row)}`}
                        className="rounded border px-2 py-1"
                        type="date"
                        disabled={savingInvoiceId !== null}
                        value={draftInvoiceDates[row.id] ?? row.invoicedAt ?? ''}
                        onChange={(event) =>
                          setDraftInvoiceDates((previous) => ({
                            ...previous,
                            [row.id]: event.target.value,
                          }))
                        }
                      />
                      <div className="mt-2 flex items-center justify-end gap-2">
                        {row.exceptionalRate !== 0 && (
                          <>
                            <CommissionInvoiceFileInput
                              label={`Invoice file for ${titleLabel(row)}`}
                              file={draftInvoiceFiles[row.id]}
                              disabled={savingInvoiceId !== null}
                              onChange={file => setDraftInvoiceFiles(previous => ({
                                ...previous, [row.id]: file,
                              }))}
                            />
                          </>
                        )}
                      </div>
                    </td>
                    <td className="p-3 no-print">
                      <div className="flex min-w-44 items-center gap-2">
                        <input
                          aria-label={`Exceptional rate for ${titleLabel(row)}`}
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
                      <div className="mt-2 flex items-center justify-start gap-2">
                        {row.exceptionalRate !== 0 && (
                          <button
                            className="edit-button"
                            type="button"
                            disabled={savingInvoiceId !== null}
                            onClick={() => void saveArtworkInvoice(row.id, invoicedCommissionAmount)}
                          >
                            {savingInvoiceId === row.id ? 'Saving...' : 'Save'}
                          </button>
                        )}
                        {row.invoiceUrl && (
                          <a
                            className="text-sm font-medium text-blue-700 underline"
                            data-print-exclude
                            href={row.invoiceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open invoice
                          </a>
                        )}
                      </div>
                      {savingInvoiceId === row.id && <span className="ml-1">…</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="border-t bg-gray-50 font-semibold">
              <tr>
                <td className="p-3" colSpan={5}>Total invoiced</td>
                <td />
                <td className="no-print" />
                <td />
                <td />
                <td className="p-3 text-right tabular-nums whitespace-nowrap">
                  {invoicedCommissionTotalsByCurrency.map(([currency, amount]) => (
                    <p key={currency} className="whitespace-nowrap">{formatMoney(amount, currency)}</p>
                  ))}
                  <p className="border-t pt-1 whitespace-nowrap">
                    {formatMoney(invoicedCommissionUsdTotal, 'USD')}
                  </p>
                </td>
                <td className="no-print" />
                <td className="no-print" />
              </tr>
              {hasInvoicedCorrections && (
                <tr>
                  <td className="p-3" colSpan={9}>Total invoiced after corrections</td>
                  <td className="p-3 text-right tabular-nums whitespace-nowrap">
                    {invoicedTotalsAfterCorrectionsByCurrency.map(([currency, amount]) => (
                      <p key={currency} className="whitespace-nowrap">
                        {formatMoney(amount, currency)}
                      </p>
                    ))}
                    <p className="border-t pt-1 whitespace-nowrap">
                    {formatMoney(invoicedTotalAfterCorrectionsUsd, 'USD')}
                    </p>
                  </td>
                  <td className="no-print" />
                  <td className="no-print" />
                </tr>
              )}
              {commissionBasesUsdByRate.map(({ rate, amount }) => (
                <tr key={rate}>
                  <td className="p-3" colSpan={7}>
                    Commission base at {(rate * 100).toFixed(0)} %
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
              <tr>
                <td className="p-3" colSpan={9}>Commissions to invoice</td>
                <td className="p-3 text-right tabular-nums whitespace-nowrap">
                  {commissionsToInvoiceTotalsByCurrency.map(([currency, amount]) => (
                    <p key={currency} className="whitespace-nowrap">{formatMoney(amount, currency)}</p>
                  ))}
                  <p className="border-t pt-1 whitespace-nowrap">{formatMoney(commissionsToInvoiceUsdTotal, 'USD')}</p>
                </td>
                <td className="no-print" />
                <td className="no-print" />
              </tr>
            </tfoot>
          </table>
          {rows.some((row) => row.purchaseUsd === null) && (
            <p className="p-3 text-sm text-red-700">
              Some prices cannot be converted to USD: enter the exchange rate for the purchase date in Inventory.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
