import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiAuth'

const EDITOR_ROLES = ['Editor', 'Administrator'] as const

type AbeBooksPrefill = {
  source_url: string
  title: string | null
  isbn: string | null
  publication_year: number | null
  search_author: string | null
  search_publisher: string | null
  publisher_search_hint: string | null
  publisher_no: number | null
  author_links: Array<{ author_id: string; label: string; is_default: boolean }>
  artist_links: Array<{ artist_id: string; label: string; is_default: boolean }>
  remarks: string | null
}

type CatalogAuthor = { id: string; legacy_no: number; first_name: string | null; last_name: string | null }
type CatalogArtist = { id: string; first_name: string | null; last_name: string | null }
type RelatedName = { legacy_no: number; name: string | null; location: string | null }

function parseNullableText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function normalizeIsbn(value: string | null): string | null {
  if (!value) return null
  const normalized = value.replace(/[^0-9Xx]/g, '').toUpperCase()
  return normalized || null
}

function parseYear(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value
  if (typeof value !== 'string') return null
  const match = value.match(/\b(1[5-9]\d{2}|20\d{2}|2100)\b/)
  if (!match) return null
  return Number(match[1])
}

function normalizePersonName(value: string | null | undefined) {
  if (!value) return ''
  return value
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/[-/]/g, ' ')
    .replaceAll('&', ' et ')
    .replaceAll('œ', 'oe')
    .replaceAll('æ', 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function signatureFromNormalized(normalized: string) {
  if (!normalized) return ''
  const parts = normalized.split(' ').filter(Boolean)
  const sortedParts = parts.toSorted((a, b) => a.localeCompare(b))
  return sortedParts.join(' ')
}

function personKeys(firstName: string | null, lastName: string | null) {
  const fullA = normalizePersonName(`${firstName ?? ''} ${lastName ?? ''}`)
  const fullB = normalizePersonName(`${lastName ?? ''} ${firstName ?? ''}`)
  const sigA = signatureFromNormalized(fullA)
  const sigB = signatureFromNormalized(fullB)
  return [fullA, fullB, sigA, sigB].filter(Boolean)
}

function tokenKeys(token: string) {
  const normalized = normalizePersonName(token)
  const signature = signatureFromNormalized(normalized)
  return [normalized, signature].filter(Boolean)
}

// Reorders a single "Lastname, Firstname" segment (AbeBooks' most common byline format).
// Segments with more than one comma are treated as alternating Last, First pairs.
function reorderCommaSegment(segment: string): string[] {
  const commaParts = segment.split(',').map((part) => part.trim()).filter(Boolean)

  if (commaParts.length === 2) {
    return [`${commaParts[1]} ${commaParts[0]}`]
  }
  if (commaParts.length > 2 && commaParts.length % 2 === 0) {
    const pairs: string[] = []
    for (let i = 0; i < commaParts.length; i += 2) {
      pairs.push(`${commaParts[i + 1]} ${commaParts[i]}`)
    }
    return pairs
  }
  return [commaParts.join(' ')]
}

function splitPeople(raw: string) {
  const cleaned = raw
    .replace(/\((hg|hrsg|ed|eds|editor|editors)\.?\)/gi, ' ')
    .replace(/\b(hg|hrsg|ed|eds|editor|editors)\.?\b/gi, ' ')

  // Strong separators split distinct people; commas are handled per-group afterwards
  // since AbeBooks often writes a single person as "Lastname, Firstname".
  const groups = cleaned
    .split(/;|\/|\||\+|&|\b(?:and|et|und)\b/gi)
    .map((group) => group.trim())
    .filter(Boolean)

  const people: string[] = []

  for (const group of groups) {
    const periodParts = group
      .split(/\.(?=\s+[A-Z0-9]|\s*$)/)
      .map((part) => part.trim())
      .filter(Boolean)

    for (const part of periodParts) {
      people.push(...reorderCommaSegment(part))
    }
  }

  // AbeBooks sometimes formats authors like "Doris und Jessica Morgan. Krytof".
  // In that shape we infer "Doris Krytof" in addition to "Jessica Morgan".
  if (/\b(and|et|und)\b/i.test(raw) && people.length >= 3) {
    const first = people[0] ?? ''
    const second = people[1] ?? ''
    const third = people[2] ?? ''
    if (first.split(/\s+/).length === 1 && second.split(/\s+/).length >= 2 && third.split(/\s+/).length === 1) {
      people.push(`${first} ${third}`)
    }
  }

  return people.filter(Boolean)
}

function personDisplayName(person: { first_name: string | null; last_name: string | null }) {
  const name = [person.first_name, person.last_name].filter(Boolean).join(' ').trim()
  return name || 'Unknown'
}

function uniqueNonEmpty(values: string[]) {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    const key = trimmed.toLowerCase()
    if (!trimmed || seen.has(key)) continue
    seen.add(key)
    unique.push(trimmed)
  }
  return unique
}

function parseHtmlMetaContent(html: string, key: string, attr: 'property' | 'name') {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`<meta[^>]+${attr}=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i')
  const match = html.match(regex)
  return parseNullableText(match?.[1] ?? null)
}

function parseHtmlTitle(html: string) {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  return parseNullableText(match?.[1] ?? null)
}

function extractAuthorsFromTitle(title: string | null) {
  if (!title) return null
  const match = /\bby\s+(.+?)(?:\s*[:|]|$)/i.exec(title)
  const value = parseNullableText(match?.[1] ?? null)
  return value
}

function normalizeSingleNamePart(value: string | null | undefined) {
  if (!value) return ''
  return normalizePersonName(value).replace(/\s+/g, ' ').trim()
}

function splitFirstAndLastFromToken(token: string) {
  const normalized = normalizePersonName(token)
  const parts = normalized.split(' ').filter(Boolean)
  if (parts.length < 2) return null
  return { first: parts[0] ?? '', last: parts[parts.length - 1] ?? '' }
}

function levenshteinDistance(a: string, b: string) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const temp = dp[j]
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost)
      prev = temp
    }
  }
  return dp[b.length]
}

function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = []
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null
  while ((match = regex.exec(html)) !== null) {
    const raw = match[1]?.trim()
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw)
      blocks.push(parsed)
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  }
  return blocks
}

function flattenJsonLdBlocks(blocks: unknown[]): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = []

  function pushNode(value: unknown) {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      value.forEach(pushNode)
      return
    }
    const node = value as Record<string, unknown>
    nodes.push(node)
    if (Array.isArray(node['@graph'])) {
      for (const entry of node['@graph']) pushNode(entry)
    }
  }

  blocks.forEach(pushNode)
  return nodes
}

function asStringArray(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (!value || typeof value !== 'object') return []
  // schema.org allows a single Person/Organization object instead of an array.
  const items = Array.isArray(value) ? value : [value]
  return items
    .map((entry) => {
      if (typeof entry === 'string') return entry
      if (!entry || typeof entry !== 'object') return ''
      const name = (entry as { name?: unknown }).name
      return typeof name === 'string' ? name : ''
    })
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function contributorNames(value: unknown): string[] {
  if (!value || typeof value !== 'object') return []
  const items = Array.isArray(value) ? value : [value]
  return items
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return ''
      const name = (entry as { name?: unknown }).name
      return typeof name === 'string' ? name.trim() : ''
    })
    .filter(Boolean)
}

function findBestBookNode(nodes: Record<string, unknown>[]) {
  return nodes.find((node) => {
    const typeValue = node['@type']
    if (typeof typeValue === 'string') {
      return typeValue.toLowerCase() === 'book' || typeValue.toLowerCase() === 'product'
    }
    if (Array.isArray(typeValue)) {
      const normalized = typeValue
        .map((entry) => (typeof entry === 'string' ? entry.toLowerCase() : ''))
        .filter(Boolean)
      return normalized.includes('book') || normalized.includes('product')
    }
    return false
  })
}

function buildPrefillFromHtml(url: string, html: string): AbeBooksPrefill {
  const jsonLdNodes = flattenJsonLdBlocks(extractJsonLdBlocks(html))
  const bookNode = findBestBookNode(jsonLdNodes)

  const titleFromJsonLd = parseNullableText(bookNode?.name)
  const isbnFromJsonLd = normalizeIsbn(parseNullableText(bookNode?.isbn ?? null))
  const yearFromJsonLd = parseYear(bookNode?.datePublished)
  const authorsFromJsonLd = asStringArray(bookNode?.author)
  const contributorsFromJsonLd = contributorNames(bookNode?.contributor)
  const publisherFromJsonLd = parseNullableText(bookNode?.publisher && typeof bookNode.publisher === 'object'
    ? (bookNode.publisher as { name?: unknown }).name
    : bookNode?.publisher)

  const title =
    titleFromJsonLd ??
    parseHtmlMetaContent(html, 'og:title', 'property') ??
    parseHtmlMetaContent(html, 'twitter:title', 'name') ??
    parseHtmlTitle(html)

  const isbn =
    isbnFromJsonLd ??
    normalizeIsbn(parseHtmlMetaContent(html, 'books:isbn', 'property'))

  const publicationYear = yearFromJsonLd
  const fallbackAuthorsFromTitle = extractAuthorsFromTitle(title)
  const allPeople = uniqueNonEmpty([
    ...authorsFromJsonLd,
    ...contributorsFromJsonLd,
    ...(fallbackAuthorsFromTitle ? [fallbackAuthorsFromTitle] : []),
  ])
  // Semicolon separator avoids ambiguity with the "Lastname, Firstname" reorder logic in splitPeople.
  const searchAuthor = allPeople.length ? allPeople.join('; ') : null
  const searchPublisher =
    publisherFromJsonLd ??
    parseHtmlMetaContent(html, 'books:publisher', 'property')

  return {
    source_url: url,
    title,
    isbn,
    publication_year: publicationYear,
    search_author: searchAuthor,
    search_publisher: searchPublisher,
    publisher_search_hint: publisherSearchHint(searchPublisher),
    publisher_no: null,
    author_links: [],
    artist_links: [],
    remarks: `Imported from AbeBooks: ${url}`,
  }
}

function matchAuthors(rawPeople: string[], catalog: CatalogAuthor[]) {
  const authorById = new Map<string, CatalogAuthor>()
  const authorIdsByKey = new Map<string, Set<string>>()

  for (const author of catalog) {
    authorById.set(author.id, author)
    for (const key of personKeys(author.first_name, author.last_name)) {
      if (!authorIdsByKey.has(key)) authorIdsByKey.set(key, new Set<string>())
      authorIdsByKey.get(key)?.add(author.id)
    }
  }

  const tokens = uniqueNonEmpty(rawPeople.flatMap(splitPeople))
  const used = new Set<string>()
  const matched: Array<{ author_id: string; label: string; is_default: boolean }> = []

  for (const token of tokens) {
    const candidates = new Set<string>()
    for (const key of tokenKeys(token)) {
      const ids = authorIdsByKey.get(key)
      if (!ids) continue
      for (const id of ids) candidates.add(id)
    }

    if (candidates.size === 0) {
      const parts = splitFirstAndLastFromToken(token)
      if (parts) {
        for (const author of catalog) {
          const first = normalizeSingleNamePart(author.first_name)
          const last = normalizeSingleNamePart(author.last_name)
          if (!first || !last) continue
          if (first !== parts.first) continue
          if (levenshteinDistance(parts.last, last) <= 1) candidates.add(author.id)
        }
      }
    }

    if (candidates.size !== 1) continue
    const matchedId = Array.from(candidates)[0]
    if (!matchedId || used.has(matchedId)) continue
    const person = authorById.get(matchedId)
    if (!person) continue

    used.add(matchedId)
    matched.push({ author_id: matchedId, label: personDisplayName(person), is_default: matched.length === 0 })
  }

  return matched
}

function matchArtists(rawPeople: string[], catalog: CatalogArtist[]) {
  const artistById = new Map<string, CatalogArtist>()
  const artistIdsByKey = new Map<string, Set<string>>()

  for (const artist of catalog) {
    artistById.set(artist.id, artist)
    for (const key of personKeys(artist.first_name, artist.last_name)) {
      if (!artistIdsByKey.has(key)) artistIdsByKey.set(key, new Set<string>())
      artistIdsByKey.get(key)?.add(artist.id)
    }
  }

  const tokens = uniqueNonEmpty(rawPeople.flatMap(splitPeople))
  const used = new Set<string>()
  const matched: Array<{ artist_id: string; label: string; is_default: boolean }> = []

  for (const token of tokens) {
    const candidates = new Set<string>()
    for (const key of tokenKeys(token)) {
      const ids = artistIdsByKey.get(key)
      if (!ids) continue
      for (const id of ids) candidates.add(id)
    }

    if (candidates.size === 0) {
      const parts = splitFirstAndLastFromToken(token)
      if (parts) {
        for (const artist of catalog) {
          const first = normalizeSingleNamePart(artist.first_name)
          const last = normalizeSingleNamePart(artist.last_name)
          if (!first || !last) continue
          if (first !== parts.first) continue
          if (levenshteinDistance(parts.last, last) <= 1) candidates.add(artist.id)
        }
      }
    }

    if (candidates.size !== 1) continue
    const matchedId = Array.from(candidates)[0]
    if (!matchedId || used.has(matchedId)) continue
    const person = artistById.get(matchedId)
    if (!person) continue

    used.add(matchedId)
    matched.push({ artist_id: matchedId, label: personDisplayName(person), is_default: matched.length === 0 })
  }

  return matched
}

const PUBLISHER_NOISE_WORDS = new Set([
  'press', 'editions', 'edition', 'éditions', 'verlag', 'publishing', 'publishers', 'publisher',
  'books', 'co', 'company', 'gmbh', 'ltd', 'inc', 'sarl', 'srl', 'ediciones', 'edizioni', 'publ',
])

// Drops generic publisher words (Press, Editions, ...) and parenthetical locations so
// "Sternberg Press" and "Sternberg (New York)" both reduce to the comparable core "sternberg".
function corePublisherName(value: string | null | undefined) {
  if (!value) return ''
  const withoutLocation = stripPublisherLocationSuffix(value)
  const withoutParens = withoutLocation.replace(/\([^)]*\)/g, ' ')
  const normalized = normalizePersonName(withoutParens)
  const tokens = normalized.split(' ').filter((token) => token && !PUBLISHER_NOISE_WORDS.has(token))
  return tokens.join(' ').trim()
}

// AbeBooks often appends a "City" or "Country" after a comma (e.g. "JRP Editions, CH");
// that suffix isn't part of the publisher name stored in the catalog, so drop it.
function stripPublisherLocationSuffix(value: string) {
  const commaIndex = value.indexOf(',')
  return commaIndex === -1 ? value : value.slice(0, commaIndex)
}

// Preserves the original casing/words while stripping the same noise words, for display/search use.
function publisherSearchHint(value: string | null | undefined) {
  if (!value) return null
  const withoutLocation = stripPublisherLocationSuffix(value)
  const withoutParens = withoutLocation.replace(/\([^)]*\)/g, ' ')
  const words = withoutParens.split(/\s+/).filter(Boolean)
  const filtered = words.filter((word) => !PUBLISHER_NOISE_WORDS.has(normalizePersonName(word)))
  const result = filtered.join(' ').trim()
  return result || value.trim() || null
}

function matchPublisher(searchPublisher: string | null, catalog: RelatedName[]) {
  if (!searchPublisher) return null
  const normalizedQuery = corePublisherName(searchPublisher)
  if (!normalizedQuery) return null

  const candidates = catalog.filter((item) => {
    const normalizedName = corePublisherName(item.name)
    if (!normalizedName) return false
    return normalizedName === normalizedQuery || normalizedName.includes(normalizedQuery) || normalizedQuery.includes(normalizedName)
  })

  // Only auto-select when there is a single unambiguous match; otherwise leave the
  // manual "Linked publisher" picker to surface every candidate for the user to choose from.
  return candidates.length === 1 ? candidates[0].legacy_no : null
}


export async function POST(request: NextRequest) {
  const authorization = await requireRole(EDITOR_ROLES, request)
  if (authorization.response) return authorization.response

  const body = await request.json().catch(() => null) as { url?: unknown } | null
  const urlValue = parseNullableText(body?.url)

  if (!urlValue) {
    return NextResponse.json({ error: 'URL AbeBooks manquante.' }, { status: 400 })
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(urlValue)
  } catch {
    return NextResponse.json({ error: 'URL invalide.' }, { status: 400 })
  }

  const host = parsedUrl.hostname.toLowerCase()
  if (!host.includes('abebooks.')) {
    return NextResponse.json({ error: 'Merci de fournir une URL AbeBooks.' }, { status: 400 })
  }

  const response = await fetch(parsedUrl.toString(), {
    method: 'GET',
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
      'accept-language': 'en-US,en;q=0.9,fr;q=0.8',
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    return NextResponse.json({ error: `AbeBooks a renvoyé ${response.status}.` }, { status: 502 })
  }

  const html = await response.text()
  const prefill = buildPrefillFromHtml(parsedUrl.toString(), html)

  const rawPeople = prefill.search_author ? uniqueNonEmpty(splitPeople(prefill.search_author)) : []
  if (rawPeople.length > 0 || prefill.search_publisher) {
    const [authorsResult, artistsResult, publishersResult] = await Promise.all([
      authorization.supabase.from('library_authors').select('id, legacy_no, first_name, last_name'),
      authorization.supabase.from('artists').select('id, first_name, last_name'),
      authorization.supabase.from('library_related_names').select('legacy_no, name, location').limit(2000),
    ])

    if (authorsResult.error) return NextResponse.json({ error: authorsResult.error.message }, { status: 500 })
    if (artistsResult.error) return NextResponse.json({ error: artistsResult.error.message }, { status: 500 })
    if (publishersResult.error) return NextResponse.json({ error: publishersResult.error.message }, { status: 500 })

    prefill.author_links = matchAuthors(rawPeople, (authorsResult.data ?? []) as CatalogAuthor[])
    prefill.artist_links = matchArtists(rawPeople, (artistsResult.data ?? []) as CatalogArtist[])
    prefill.publisher_no = matchPublisher(prefill.search_publisher, (publishersResult.data ?? []) as RelatedName[])
  }

  if (!prefill.title && !prefill.isbn && !prefill.search_author && !prefill.search_publisher) {
    return NextResponse.json({ error: 'Impossible d’extraire des données depuis cette page AbeBooks.' }, { status: 422 })
  }

  return NextResponse.json({ prefill })
}
