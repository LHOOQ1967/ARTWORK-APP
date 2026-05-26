
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ArtworkForm, Artist, Contact } from '@/app/(protected)/types/artwork'
import { ArtworkFieldsLayout } from './ArtworkFieldsLayout'
import { supabase } from '@/lib/supabaseBrowser'

type ArtworkCreateInitialValues = {
  import_id?: string
  artist_id?: string
  artist_name?: string
  title?: string
  year?: string | number
  medium?: string
  dimensions?: string
  notes?: string
  height_cm?: string | number
  width_cm?: string | number
  depth_cm?: string | number
  inventory_number?: string
  lot?: string
  status?: string
}

type ManualImportPrefill = {
  import_id?: string
  artist_name?: string | null
  artist_id?: string | null
  title?: string | null
  year?: string | number | null
  medium?: string | null
  dimensions?: string | null
  notes?: string | null
  height_cm?: string | number | null
  width_cm?: string | number | null
  depth_cm?: string | number | null
  inventory_number?: string | null
  lot?: string | null
  source?: string | null
}

type ArtworkImportRow = {
  id: string
  artist_match_id: string | null
  parsed_data?: Record<string, any> | null
  confidence?: Record<string, any> | null
  status?: string
  image_url?: string | null
  ocr_text?: string | null
}

type ArtworkCreateContentProps = {
  initialValues?: ArtworkCreateInitialValues | null
  importRow?: ArtworkImportRow | null
}

const EMPTY_ARTWORK: ArtworkForm = {
  title: '',
  medium: null,
  signature: null,
  year_execution: null,
  dimensions: null,

  date_acquisition: null,
  cost_amount: null,
  cost_currency: null,
  commission_blondeau: null,

  status: 'Draft',
  priority: 'Medium',
  auctions: false,

  asking_price: null,
  currency: 'CHF',

  artist_id: null,
  location_contact_id: null,
  auction_contact_id: null,
  buyer_contact_id: null,
  destination_contact_id: null,
  certificate_location_contact_id: null,
  proposed_by_id: null,

  sale_date: null,
  sale_time: null,
  auction_link: null,
  auction_currency: null,
  lot: null,

  estimate_low: null,
  estimate_high: null,
  auction_max_hammer: null,
  auction_max_premium: null,

  sold_hammer: null,
  sold_premium: null,
  underbidder: false,
  guarantee: false,

  date_proposition: new Date().toISOString().slice(0, 10),
  view_date: null,
  condition: null,
  notes: null,
  certificate: false,
  check_seller: false,

  height_cm: null,
  width_cm: null,
  depth_cm: null,

  insurance_value: null,
  insurance_currency: null,
  updated_at: null,

  documents: [],
  artwork_proposals: [],
}

function Spinner({
  size = 16,
  color = '#ffffff',
}: {
  size?: number
  color?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 50 50"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <circle
        cx="25"
        cy="25"
        r="20"
        fill="none"
        stroke="rgba(255,255,255,0.25)"
        strokeWidth="5"
      />
      <path
        d="M25 5a20 20 0 0 1 20 20"
        fill="none"
        stroke={color}
        strokeWidth="5"
        strokeLinecap="round"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 25 25"
          to="360 25 25"
          dur="0.8s"
          repeatCount="indefinite"
        />
      </path>
    </svg>
  )
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function scoreArtistMatch(artist: Artist, query: string) {
  const first = normalizeText(artist.first_name ?? '')
  const last = normalizeText(artist.last_name ?? '')
  const full = `${first} ${last}`.trim()
  const reversed = `${last} ${first}`.trim()
  const q = normalizeText(query)
  const terms = q.split(' ').filter(Boolean)

  if (!terms.length) return -1

  if (full === q || reversed === q) return 100
  if (full.startsWith(q) || reversed.startsWith(q)) return 85

  const allTermsMatch = terms.every(
    (term) =>
      first.includes(term) ||
      last.includes(term) ||
      full.includes(term) ||
      reversed.includes(term)
  )

  if (!allTermsMatch) return -1

  let score = 50

  for (const term of terms) {
    if (first === term || last === term) score += 10
    else if (first.startsWith(term) || last.startsWith(term)) score += 6
    else if (first.includes(term) || last.includes(term)) score += 3
  }

  return score
}

function scoreContactMatch(contact: Contact, query: string) {
  const company = normalizeText(contact.company_name ?? '')
  const first = normalizeText(contact.first_name ?? '')
  const last = normalizeText(contact.last_name ?? '')
  const full = `${first} ${last}`.trim()
  const reversed = `${last} ${first}`.trim()
  const companyFull = `${company} ${first} ${last}`.trim()
  const q = normalizeText(query)
  const terms = q.split(' ').filter(Boolean)

  if (!terms.length) return -1

  if (
    company === q ||
    full === q ||
    reversed === q ||
    companyFull === q
  ) {
    return 100
  }

  if (
    company.startsWith(q) ||
    full.startsWith(q) ||
    reversed.startsWith(q) ||
    companyFull.startsWith(q)
  ) {
    return 85
  }

  const allTermsMatch = terms.every(
    (term) =>
      company.includes(term) ||
      first.includes(term) ||
      last.includes(term) ||
      full.includes(term) ||
      reversed.includes(term) ||
      companyFull.includes(term)
  )

  if (!allTermsMatch) return -1

  let score = 50

  for (const term of terms) {
    if (company === term || first === term || last === term) score += 10
    else if (
      company.startsWith(term) ||
      first.startsWith(term) ||
      last.startsWith(term)
    ) {
      score += 6
    } else if (
      company.includes(term) ||
      first.includes(term) ||
      last.includes(term)
    ) {
      score += 3
    }
  }

  return score
}

function mergeUniqueArtists(existing: Artist[], incoming: Artist[]) {
  const map = new Map<string, Artist>()

  for (const item of existing) {
    map.set(item.id, item)
  }

  for (const item of incoming) {
    map.set(item.id, item)
  }

  return Array.from(map.values())
}

function mergeUniqueContacts(existing: Contact[], incoming: Contact[]) {
  const map = new Map<string, Contact>()

  for (const item of existing) {
    map.set(item.id, item)
  }

  for (const item of incoming) {
    map.set(item.id, item)
  }

  return Array.from(map.values())
}

function useDebouncedArtistSearch(query: string) {
  const [results, setResults] = useState<Artist[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const q = query.trim()

    if (!q || q.length < 2) {
      setResults([])
      setLoading(false)
      return
    }

    let active = true

    const timeout = setTimeout(async () => {
      setLoading(true)

      const terms = normalizeText(q).split(' ').filter(Boolean)
      const orFilters = terms.flatMap((term) => [
        `first_name.ilike.%${term}%`,
        `last_name.ilike.%${term}%`,
      ])

      const { data, error } = await supabase
        .from('artists')
        .select('id, first_name, last_name')
        .or(orFilters.join(','))
        .limit(60)

      if (!active) return

      if (error) {
        console.error('SEARCH ARTISTS FAILED:', error)
        setResults([])
        setLoading(false)
        return
      }

      const ranked = ((data as Artist[]) ?? [])
        .map((artist) => ({
          artist,
          score: scoreArtistMatch(artist, q),
        }))
        .filter((item) => item.score >= 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score

          const aLast = normalizeText(a.artist.last_name ?? '')
          const bLast = normalizeText(b.artist.last_name ?? '')
          return aLast.localeCompare(bLast)
        })
        .map((item) => item.artist)
        .slice(0, 20)

      setResults(ranked)
      setLoading(false)
    }, 250)

    return () => {
      active = false
      clearTimeout(timeout)
    }
  }, [query])

  return { results, loading }
}

function useDebouncedContactSearch(query: string) {
  const [results, setResults] = useState<Contact[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const q = query.trim()

    if (!q || q.length < 2) {
      setResults([])
      setLoading(false)
      return
    }

    let active = true

    const timeout = setTimeout(async () => {
      setLoading(true)

      const terms = normalizeText(q).split(' ').filter(Boolean)
      const orFilters = terms.flatMap((term) => [
        `company_name.ilike.%${term}%`,
        `first_name.ilike.%${term}%`,
        `last_name.ilike.%${term}%`,
      ])

      const { data, error } = await supabase
        .from('contacts')
        .select('id, company_name, first_name, last_name')
        .or(orFilters.join(','))
        .limit(60)

      if (!active) return

      if (error) {
        console.error('SEARCH CONTACTS FAILED:', error)
        setResults([])
        setLoading(false)
        return
      }

      const ranked = ((data as Contact[]) ?? [])
        .map((contact) => ({
          contact,
          score: scoreContactMatch(contact, q),
        }))
        .filter((item) => item.score >= 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score

          const aCompany = normalizeText(a.contact.company_name ?? '')
          const bCompany = normalizeText(b.contact.company_name ?? '')
          const aLast = normalizeText(a.contact.last_name ?? '')
          const bLast = normalizeText(b.contact.last_name ?? '')

          return (aCompany || aLast).localeCompare(bCompany || bLast)
        })
        .map((item) => item.contact)
        .slice(0, 20)

      setResults(ranked)
      setLoading(false)
    }, 250)

    return () => {
      active = false
      clearTimeout(timeout)
    }
  }, [query])

  return { results, loading }
}

function toNullableText(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const v = String(value).trim()
  return v ? v : null
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(String(value).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function parseDimensionsText(value: string | null | undefined): {
  height_cm: number | null
  width_cm: number | null
  depth_cm: number | null
} {
  if (!value) {
    return {
      height_cm: null,
      width_cm: null,
      depth_cm: null,
    }
  }

  const cleaned = String(value)
    .toLowerCase()
    .replace(/,/g, '.')
    .replace(/\s*[×x]\s*/g, ' x ')
    .replace(/\s+/g, ' ')
    .trim()

  const match = cleaned.match(
    /(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)(?:\s*x\s*(\d+(?:\.\d+)?))?\s*cm?/
  )

  if (!match) {
    return {
      height_cm: null,
      width_cm: null,
      depth_cm: null,
    }
  }

  const h = Number(match[1])
  const w = Number(match[2])
  const d = match[3] ? Number(match[3]) : null

  return {
    height_cm: Number.isFinite(h) ? h : null,
    width_cm: Number.isFinite(w) ? w : null,
    depth_cm: d !== null && Number.isFinite(d) ? d : null,
  }
}

function buildDimensionsString(
  heightCm: number | null,
  widthCm: number | null,
  depthCm: number | null
): string | null {
  if (heightCm === null || widthCm === null) return null
  return `${heightCm} x ${widthCm} x ${depthCm ?? 0} cm`
}

function mergeInitialValuesWithManualPrefill(
  initialValues: ArtworkCreateInitialValues | null | undefined,
  manualPrefill: ManualImportPrefill | null
): ArtworkCreateInitialValues | null {
  if (!initialValues && !manualPrefill) return null

  const base: ArtworkCreateInitialValues = {
    ...(initialValues ?? {}),
  }

  if (!manualPrefill) {
    return base
  }

  const merged: ArtworkCreateInitialValues = {
    ...base,
  }

  const assignText = (key: keyof ArtworkCreateInitialValues, value: unknown) => {
    if (value === null || value === undefined) return
    const str = String(value).trim()
    if (!str) return
    ;(merged as any)[key] = str
  }

  const assignNumberOrString = (
    key: keyof ArtworkCreateInitialValues,
    value: unknown
  ) => {
    if (value === null || value === undefined || value === '') return
    ;(merged as any)[key] = value
  }

  if (manualPrefill.import_id) merged.import_id = manualPrefill.import_id
  if (manualPrefill.artist_id) merged.artist_id = manualPrefill.artist_id

  assignText('artist_name', manualPrefill.artist_name)
  assignText('title', manualPrefill.title)
  assignNumberOrString('year', manualPrefill.year)
  assignText('medium', manualPrefill.medium)
  assignText('notes', manualPrefill.notes)

  assignNumberOrString('height_cm', manualPrefill.height_cm)
  assignNumberOrString('width_cm', manualPrefill.width_cm)
  assignNumberOrString('depth_cm', manualPrefill.depth_cm)

  assignText('inventory_number', manualPrefill.inventory_number)
  assignText('lot', manualPrefill.lot ?? manualPrefill.inventory_number)

  const manualDimensions =
    toNullableText(manualPrefill.dimensions) ??
    buildDimensionsString(
      toNullableNumber(manualPrefill.height_cm),
      toNullableNumber(manualPrefill.width_cm),
      toNullableNumber(manualPrefill.depth_cm)
    )

  if (manualDimensions) {
    merged.dimensions = manualDimensions
  }

  return merged
}

function buildArtworkFromInitialValues(initialValues: ArtworkCreateInitialValues): ArtworkForm {
  const parsedFromDimensions = parseDimensionsText(initialValues.dimensions)

  const heightCm =
    toNullableNumber(initialValues.height_cm) ?? parsedFromDimensions.height_cm

  const widthCm =
    toNullableNumber(initialValues.width_cm) ?? parsedFromDimensions.width_cm

  const depthCm =
    toNullableNumber(initialValues.depth_cm) ?? parsedFromDimensions.depth_cm

  const dimensions =
    toNullableText(initialValues.dimensions) ??
    buildDimensionsString(heightCm, widthCm, depthCm)

  return {
    ...EMPTY_ARTWORK,
    title: toNullableText(initialValues.title) ?? '',
    medium: toNullableText(initialValues.medium),
    year_execution: toNullableNumber(initialValues.year),
    dimensions,
    notes: toNullableText(initialValues.notes),
    artist_id: toNullableText(initialValues.artist_id),

    height_cm: heightCm,
    width_cm: widthCm,
    depth_cm: depthCm,

    // utile pour les imports de lots / références
    lot:
      toNullableText(initialValues.lot) ??
      toNullableText(initialValues.inventory_number),

    status: 'Draft',
  }
}

export default function ArtworkCreateContent({
  initialValues = null,
  importRow = null,
}: ArtworkCreateContentProps) {
  const router = useRouter()

  const [artwork, setArtwork] = useState<ArtworkForm>(EMPTY_ARTWORK)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [contactOptions, setContactOptions] = useState<Contact[]>([])
  const [artistOptions, setArtistOptions] = useState<Artist[]>([])

  const [manualPrefill, setManualPrefill] = useState<ManualImportPrefill | null>(null)
  const [manualPrefillLoaded, setManualPrefillLoaded] = useState(false)

  // Queries
  const [artistQuery, setArtistQuery] = useState('')

  const [proposedByQuery, setProposedByQuery] = useState('')
  const [locationQuery, setLocationQuery] = useState('')
  const [certificateLocationQuery, setCertificateLocationQuery] = useState('')
  const [auctionHouseQuery, setAuctionHouseQuery] = useState('')
  const [buyerQuery, setBuyerQuery] = useState('')
  const [destinationQuery, setDestinationQuery] = useState('')

  // Pour éviter de ré-appliquer le préremplissage plusieurs fois
  const appliedImportRef = useRef<string | null>(null)

  const currentImportId =
    initialValues?.import_id ??
    importRow?.id ??
    null

  const mergedInitialValues = useMemo(() => {
    return mergeInitialValuesWithManualPrefill(initialValues, manualPrefill)
  }, [initialValues, manualPrefill])

  // Search hooks
  const { results: artistResults, loading: artistLoading } =
    useDebouncedArtistSearch(artistQuery)

  const { results: proposedByResults, loading: proposedByLoading } =
    useDebouncedContactSearch(proposedByQuery)

  const { results: locationResults, loading: locationLoading } =
    useDebouncedContactSearch(locationQuery)

  const {
    results: certificateLocationResults,
    loading: certificateLocationLoading,
  } = useDebouncedContactSearch(certificateLocationQuery)

  const { results: auctionHouseResults, loading: auctionHouseLoading } =
    useDebouncedContactSearch(auctionHouseQuery)

  const { results: buyerResults, loading: buyerLoading } =
    useDebouncedContactSearch(buyerQuery)

  const { results: destinationResults, loading: destinationLoading } =
    useDebouncedContactSearch(destinationQuery)

  // Load initial contacts
  useEffect(() => {
    const loadContacts = async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, company_name, first_name, last_name')
        .order('company_name', { ascending: true })
        .limit(200)

      if (error) {
        console.error('LOAD CONTACTS FAILED:', error)
        return
      }

      setContactOptions((data as Contact[]) ?? [])
    }

    loadContacts()
  }, [])

  // Load initial artists
  useEffect(() => {
    const loadArtists = async () => {
      const { data, error } = await supabase
        .from('artists')
        .select('id, first_name, last_name')
        .order('last_name', { ascending: true })
        .limit(200)

      if (error) {
        console.error('LOAD ARTISTS FAILED:', error)
        return
      }

      setArtistOptions((data as Artist[]) ?? [])
    }

    loadArtists()
  }, [])

  // Lire les corrections manuelles depuis sessionStorage
  useEffect(() => {
    if (!currentImportId) {
      setManualPrefill(null)
      setManualPrefillLoaded(true)
      return
    }

    try {
      const raw = sessionStorage.getItem(`artwork_import_prefill_${currentImportId}`)
      if (!raw) {
        setManualPrefill(null)
        setManualPrefillLoaded(true)
        return
      }

      const parsed = JSON.parse(raw) as ManualImportPrefill
      setManualPrefill(parsed ?? null)
      setManualPrefillLoaded(true)
    } catch (error) {
      console.error('[ARTWORK_CREATE] impossible de lire le prefill manuel', error)
      setManualPrefill(null)
      setManualPrefillLoaded(true)
    }
  }, [currentImportId])

  // Keep searched artists in local options so selected labels stay available
  useEffect(() => {
    if (artistResults.length > 0) {
      setArtistOptions((current) => mergeUniqueArtists(current, artistResults))
    }
  }, [artistResults])

  // Keep searched contacts in local options too
  useEffect(() => {
    const merged = [
      ...proposedByResults,
      ...locationResults,
      ...certificateLocationResults,
      ...auctionHouseResults,
      ...buyerResults,
      ...destinationResults,
    ]

    if (merged.length > 0) {
      setContactOptions((current) => mergeUniqueContacts(current, merged))
    }
  }, [
    proposedByResults,
    locationResults,
    certificateLocationResults,
    auctionHouseResults,
    buyerResults,
    destinationResults,
  ])

  // ✅ Appliquer le préremplissage import + corrections manuelles une seule fois
  useEffect(() => {
    if (!manualPrefillLoaded) return
    if (!mergedInitialValues) return

    const currentApplyKey = JSON.stringify({
      import_id: mergedInitialValues.import_id ?? '__no_import_id__',
      manualPrefill,
    })

    if (appliedImportRef.current === currentApplyKey) return

    const prefilledArtwork = buildArtworkFromInitialValues(mergedInitialValues)

    setArtwork((prev) => ({
      ...prev,
      ...prefilledArtwork,
      // on garde quand même certains defaults utiles du formulaire
      date_proposition: prev.date_proposition || EMPTY_ARTWORK.date_proposition,
      priority: prev.priority || EMPTY_ARTWORK.priority,
      currency: prev.currency || EMPTY_ARTWORK.currency,
      cost_currency: prev.cost_currency || EMPTY_ARTWORK.cost_currency,
      auction_currency: prev.auction_currency || EMPTY_ARTWORK.auction_currency,
      insurance_currency: prev.insurance_currency || EMPTY_ARTWORK.insurance_currency,
    }))

    // Priorité 1 : nom artiste corrigé manuellement
    const manualArtistName =
      manualPrefill?.artist_name ? String(manualPrefill.artist_name) : ''

    // Priorité 2 : initialValues éventuel
    const initialArtistName =
      mergedInitialValues.artist_name ? String(mergedInitialValues.artist_name) : ''

    // Priorité 3 : valeur OCR brute / normalisée
    const artistNameFromImport =
      importRow?.parsed_data?.normalized?.artist_name ??
      importRow?.parsed_data?.artist_raw ??
      ''

    if (!mergedInitialValues.artist_id) {
      const queryName = manualArtistName || initialArtistName || String(artistNameFromImport || '')
      if (queryName) {
        setArtistQuery(queryName)
      }
    }

    appliedImportRef.current = currentApplyKey
  }, [manualPrefillLoaded, mergedInitialValues, manualPrefill, importRow])

  // ✅ S'assurer que l'artiste prérempli est disponible dans artistOptions
  useEffect(() => {
    const artistId = artwork.artist_id
    if (!artistId) return

    const alreadyPresent = artistOptions.some((artist) => artist.id === artistId)
    if (alreadyPresent) return

    const loadSelectedArtist = async () => {
      const { data, error } = await supabase
        .from('artists')
        .select('id, first_name, last_name')
        .eq('id', artistId)
        .single()

      if (error) {
        console.error('LOAD SELECTED ARTIST FAILED:', error)
        return
      }

      if (data) {
        setArtistOptions((current) => mergeUniqueArtists(current, [data as Artist]))
      }
    }

    loadSelectedArtist()
  }, [artwork.artist_id, artistOptions])

  async function saveArtwork() {
    if (!artwork.title || !artwork.title.trim()) {
      setError('Title is required')
      return
    }

    try {
      setSaving(true)
      setError(null)

      const payload = {
        title: artwork.title,
        medium: artwork.medium,
        signature: artwork.signature,
        year_execution: artwork.year_execution,

        date_acquisition: artwork.date_acquisition,
        cost_amount: artwork.cost_amount,
        cost_currency: artwork.cost_currency,
        commission_blondeau: artwork.commission_blondeau,

        status: artwork.status,
        priority: artwork.priority,
        auctions: artwork.auctions,

        asking_price: artwork.asking_price,
        currency: artwork.currency,

        artist_id: artwork.artist_id,
        location_contact_id: artwork.location_contact_id,
        auction_contact_id: artwork.auction_contact_id,
        buyer_contact_id: artwork.buyer_contact_id,
        destination_contact_id: artwork.destination_contact_id,
        certificate_location_contact_id: artwork.certificate_location_contact_id,
        proposed_by_id: artwork.proposed_by_id,

        sale_date: artwork.sale_date,
        sale_time: artwork.sale_time,
        auction_link: artwork.auction_link,
        auction_currency: artwork.auction_currency,
        lot: artwork.lot,

        estimate_low: artwork.estimate_low,
        estimate_high: artwork.estimate_high,
        auction_max_hammer: artwork.auction_max_hammer,
        auction_max_premium: artwork.auction_max_premium,

        sold_hammer: artwork.sold_hammer,
        sold_premium: artwork.sold_premium,
        underbidder: artwork.underbidder,
        guarantee: artwork.guarantee,

        date_proposition: artwork.date_proposition,
        view_date: artwork.view_date,
        condition: artwork.condition,
        notes: artwork.notes,
        certificate: artwork.certificate,
        check_seller: artwork.check_seller,

        height_cm: artwork.height_cm,
        width_cm: artwork.width_cm,
        depth_cm: artwork.depth_cm,

        insurance_value: artwork.insurance_value,
        insurance_currency: artwork.insurance_currency,
      }

      const { data, error } = await supabase
        .from('artworks')
        .insert(payload)
        .select()
        .single()

      if (error) {
        console.error('CREATE ARTWORK FAILED:', error)
        setError(error.message)
        return
      }

      if (!data?.id) {
        console.error('NO DATA RETURNED:', data)
        setError('Artwork not created (no id)')
        return
      }

      // ✅ Si l’œuvre provient d’un import d’étiquette, on relie l’import à la nouvelle œuvre
      if (importRow?.id) {
        const { error: importUpdateError } = await supabase
          .from('artwork_imports')
          .update({
            artwork_id: data.id,
            status: 'converted',
          })
          .eq('id', importRow.id)

        if (importUpdateError) {
          console.error('UPDATE ARTWORK_IMPORTS FAILED:', importUpdateError)
          // on ne bloque pas la navigation pour autant
        }
      }

      // ✅ Nettoyage du prefill manuel après création réussie
      if (currentImportId) {
        try {
          sessionStorage.removeItem(`artwork_import_prefill_${currentImportId}`)
        } catch (error) {
          console.error('[ARTWORK_CREATE] impossible de supprimer le prefill manuel', error)
        }
      }

      router.push(`/artworks/print/${data.id}`)
    } catch (err) {
      console.error('UNEXPECTED CREATE ERROR:', err)
      setError('Unexpected error while creating artwork')
    } finally {
      setSaving(false)
    }
  }

  const importArtistName =
    manualPrefill?.artist_name ??
    initialValues?.artist_name ??
    importRow?.parsed_data?.normalized?.artist_name ??
    importRow?.parsed_data?.artist_raw ??
    null

  return (
    <main
      style={{
        paddingTop: 80,
        paddingLeft: 10,
        paddingRight: 10,
        paddingBottom: 20,
        backgroundColor: '#006039',
        color: 'white',
        minHeight: '100vh',
      }}
    >
      <div
        style={{
          maxWidth: 1040,
          margin: '0 auto',
        }}
      >
        <h3
          style={{
            textAlign: 'center',
            fontSize: '1.3rem',
            marginTop: 0,
            marginBottom: 12,
          }}
        >
          Create Artwork
        </h3>

        {importRow && (
          <div
            style={{
              marginBottom: 16,
              backgroundColor: '#eef6ff',
              color: '#183247',
              border: '1px solid #cfe0f3',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: '0.95rem',
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              Prefill from label import
            </div>
            <div style={{ lineHeight: 1.45 }}>
              Import ID: <strong>{importRow.id}</strong>
              {importArtistName ? (
                <>
                  {' '}— Artist detected: <strong>{importArtistName}</strong>
                </>
              ) : null}
              {manualPrefill ? (
                <>
                  {' '}— <strong>Manual corrections applied</strong>
                </>
              ) : null}
            </div>
          </div>
        )}

        {error && (
          <div
            style={{
              marginBottom: 16,
              backgroundColor: '#ffe6e6',
              color: '#8b0000',
              border: '1px solid #e0a0a0',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: '0.95rem',
            }}
          >
            {error}
          </div>
        )}


<div
  style={{
    position: 'sticky',
    top: 70,
    zIndex: 30,
    backgroundColor: '#006039',
    paddingTop: 8,
    paddingBottom: 10,
    marginBottom: 18,
  }}
>
  <div
    style={{
      display: 'flex',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap',
    }}
  >
    {saving && (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: '0.95rem',
          color: '#eaf7ef',
        }}
      >
        <Spinner size={16} />
        <span>Saving artwork…</span>
      </div>
    )}

    <button
      className="edit-button"
      type="button"
      onClick={() => router.back()}
      disabled={saving}
    >
      Cancel
    </button>

    <button
      className="edit-button"
      type="button"
      onClick={saveArtwork}
      disabled={saving}
      style={{
        opacity: saving ? 0.85 : 1,
        cursor: saving ? 'not-allowed' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      {saving ? (
        <>
          <Spinner size={14} />
          <span>Saving…</span>
        </>
      ) : (
        'Save'
      )}
    </button>
  </div>
</div>


        <ArtworkFieldsLayout
          artwork={artwork}
          setArtwork={setArtwork}
          isEditing={!saving}

          // Artists
          artistQuery={artistQuery}
          setArtistQuery={setArtistQuery}
          artistResults={artistResults}
          artistOptions={artistOptions}
          artistLoading={artistLoading}

          // Shared contacts base list
          contactOptions={contactOptions}

          // Proposed by
          proposedByQuery={proposedByQuery}
          setProposedByQuery={setProposedByQuery}
          proposedByResults={proposedByResults}
          proposedByLoading={proposedByLoading}

          // Location
          locationQuery={locationQuery}
          setLocationQuery={setLocationQuery}
          locationResults={locationResults}
          locationLoading={locationLoading}

          // Certificate location
          certificateLocationQuery={certificateLocationQuery}
          setCertificateLocationQuery={setCertificateLocationQuery}
          certificateLocationResults={certificateLocationResults}
          certificateLocationLoading={certificateLocationLoading}

          // Auction house
          auctionHouseQuery={auctionHouseQuery}
          setAuctionHouseQuery={setAuctionHouseQuery}
          auctionHouseResults={auctionHouseResults}
          auctionHouseLoading={auctionHouseLoading}

          // Buyer
          buyerQuery={buyerQuery}
          setBuyerQuery={setBuyerQuery}
          buyerResults={buyerResults}
          buyerLoading={buyerLoading}

          // Destination
          destinationQuery={destinationQuery}
          setDestinationQuery={setDestinationQuery}
          destinationResults={destinationResults}
          destinationLoading={destinationLoading}
        />
      </div>
    </main>
  )
}
