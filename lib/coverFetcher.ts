export type CoverImageData = {
  arrayBuffer: ArrayBuffer
  contentType: string
  source: string
}

export function normalizeIsbn(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/[^0-9Xx]/g, '').toUpperCase()
}

export function isbn13to10(isbn13: string): string | null {
  if (!isbn13 || !isbn13.startsWith('978') || isbn13.length !== 13) return null
  const core = isbn13.slice(3, 12)
  let sum = 0
  for (let i = 0; i < 9; i++) {
    sum += parseInt(core[i], 10) * (10 - i)
  }
  const check = (11 - (sum % 11)) % 11
  const checkChar = check === 10 ? 'X' : check.toString()
  return core + checkChar
}

export function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export async function fetchCoverImage(url: string, sourceName: string): Promise<CoverImageData | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const response = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    })
    clearTimeout(timeout)
    if (!response.ok) return null
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.startsWith('image/')) return null
    const arrayBuffer = await response.arrayBuffer()
    // Small placeholder images (such as Amazon 1x1 GIF / 43b) should be rejected.
    if (arrayBuffer.byteLength < 1000) return null
    return { arrayBuffer, contentType, source: sourceName }
  } catch {
    return null
  }
}

export async function findCoverForBook(
  isbn: string | null | undefined,
  title?: string | null,
  author?: string | null
): Promise<CoverImageData | null> {
  const normIsbn = normalizeIsbn(isbn)
  const isbn10 = normIsbn.length === 13 ? isbn13to10(normIsbn) : (normIsbn.length === 10 ? normIsbn : null)

  // 1. Open Library by ISBN
  if (normIsbn) {
    const openLib = await fetchCoverImage(`https://covers.openlibrary.org/b/isbn/${normIsbn}-L.jpg?default=false`, 'OpenLibrary (ISBN)')
    if (openLib) return openLib
  }

  // 2. Amazon CDN (ISBN-10 preferred, then raw/ISBN-13)
  if (isbn10) {
    const amazon10 = await fetchCoverImage(`https://images-na.ssl-images-amazon.com/images/P/${isbn10}.01.LZZZZZZZ.jpg`, 'Amazon (ISBN-10)')
    if (amazon10) return amazon10
  }
  if (normIsbn && normIsbn !== isbn10) {
    const amazonRaw = await fetchCoverImage(`https://images-na.ssl-images-amazon.com/images/P/${normIsbn}.01.LZZZZZZZ.jpg`, 'Amazon (ISBN)')
    if (amazonRaw) return amazonRaw
  }

  // 3. AbeBooks CDN
  if (normIsbn) {
    const abebooksRaw = await fetchCoverImage(`https://pictures.abebooks.com/isbn/${normIsbn}.jpg`, 'AbeBooks (ISBN)')
    if (abebooksRaw) return abebooksRaw
  }
  if (isbn10 && isbn10 !== normIsbn) {
    const abebooks10 = await fetchCoverImage(`https://pictures.abebooks.com/isbn/${isbn10}.jpg`, 'AbeBooks (ISBN-10)')
    if (abebooks10) return abebooks10
  }
  if (normIsbn) {
    for (const suffix of ['-us', '-fr', '-uk', '-de']) {
      const abebooksSuffix = await fetchCoverImage(`https://pictures.abebooks.com/isbn/${normIsbn}${suffix}.jpg`, `AbeBooks (${suffix})`)
      if (abebooksSuffix) return abebooksSuffix
    }
  }

  // 4. Google Books API by ISBN
  if (normIsbn) {
    try {
      const gRes = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${normIsbn}`)
      if (gRes.ok) {
        const gData = await gRes.json()
        const thumb = gData.items?.[0]?.volumeInfo?.imageLinks?.thumbnail || gData.items?.[0]?.volumeInfo?.imageLinks?.smallThumbnail
        if (thumb) {
          const secureThumb = thumb.replace(/^http:\/\//i, 'https://')
          const googleImg = await fetchCoverImage(secureThumb, 'GoogleBooks (ISBN)')
          if (googleImg) return googleImg
        }
      }
    } catch {}
  }

  // 5. Open Library by title match (strict)
  if (title?.trim()) {
    try {
      const params = new URLSearchParams({ title: title.trim(), limit: '5', fields: 'title,cover_i' })
      if (author?.trim()) params.set('author', author.trim())
      const olRes = await fetch(`https://openlibrary.org/search.json?${params.toString()}`)
      if (olRes.ok) {
        const payload = await olRes.json().catch(() => null)
        const normalizedTarget = normalizeTitle(title)
        const match = (payload?.docs ?? []).find(
          (doc: { cover_i?: number; title?: string }) => typeof doc.cover_i === 'number' && normalizeTitle(doc.title ?? '') === normalizedTarget
        )
        if (match?.cover_i) {
          const img = await fetchCoverImage(`https://covers.openlibrary.org/b/id/${match.cover_i}-L.jpg`, 'OpenLibrary (Title)')
          if (img) return img
        }
      }
    } catch {}
  }

  return null
}
