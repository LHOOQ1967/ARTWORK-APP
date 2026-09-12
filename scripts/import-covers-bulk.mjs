import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: class DummyWS {} },
})

function normalizeIsbn(value) {
  if (typeof value !== 'string') return ''
  return value.replace(/[^0-9Xx]/g, '').toUpperCase()
}

function isbn13to10(isbn13) {
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

function normalizeTitle(value) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

async function fetchImageBuffer(url) {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    })
    clearTimeout(timeout)
    if (!response.ok) return null
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.startsWith('image/')) return null
    const arrayBuffer = await response.arrayBuffer()
    // Amazon returns a 43-byte 1x1 transparent image when missing. Real covers are > 1000 bytes.
    if (arrayBuffer.byteLength < 1000) return null
    return { arrayBuffer, contentType, byteLength: arrayBuffer.byteLength }
  } catch {
    return null
  }
}

async function searchCover(isbn, title, author) {
  const normIsbn = normalizeIsbn(isbn)
  const isbn10 = normIsbn.length === 13 ? isbn13to10(normIsbn) : (normIsbn.length === 10 ? normIsbn : null)

  // 1. Amazon CDN (ISBN-10 preferred, then ISBN-13 / raw)
  if (isbn10) {
    const amazon10 = await fetchImageBuffer(`https://images-na.ssl-images-amazon.com/images/P/${isbn10}.01.LZZZZZZZ.jpg`)
    if (amazon10) return { ...amazon10, source: 'Amazon (ISBN-10)' }
  }
  if (normIsbn && normIsbn !== isbn10) {
    const amazonRaw = await fetchImageBuffer(`https://images-na.ssl-images-amazon.com/images/P/${normIsbn}.01.LZZZZZZZ.jpg`)
    if (amazonRaw) return { ...amazonRaw, source: 'Amazon (ISBN)' }
  }

  // 2. AbeBooks CDN
  if (normIsbn) {
    const abebooksRaw = await fetchImageBuffer(`https://pictures.abebooks.com/isbn/${normIsbn}.jpg`)
    if (abebooksRaw) return { ...abebooksRaw, source: 'AbeBooks (ISBN)' }
  }
  if (isbn10 && isbn10 !== normIsbn) {
    const abebooks10 = await fetchImageBuffer(`https://pictures.abebooks.com/isbn/${isbn10}.jpg`)
    if (abebooks10) return { ...abebooks10, source: 'AbeBooks (ISBN-10)' }
  }
  if (normIsbn) {
    for (const suffix of ['-us', '-fr', '-uk', '-de']) {
      const abebooksSuffix = await fetchImageBuffer(`https://pictures.abebooks.com/isbn/${normIsbn}${suffix}.jpg`)
      if (abebooksSuffix) return { ...abebooksSuffix, source: `AbeBooks (${suffix})` }
    }
  }

  // 3. Open Library by ISBN (in case missed)
  if (normIsbn) {
    const openLib = await fetchImageBuffer(`https://covers.openlibrary.org/b/isbn/${normIsbn}-L.jpg?default=false`)
    if (openLib) return { ...openLib, source: 'OpenLibrary (ISBN)' }
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
          const googleImg = await fetchImageBuffer(secureThumb)
          if (googleImg) return { ...googleImg, source: 'GoogleBooks (ISBN)' }
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
          (doc) => typeof doc.cover_i === 'number' && normalizeTitle(doc.title ?? '') === normalizedTarget
        )
        if (match?.cover_i) {
          const img = await fetchImageBuffer(`https://covers.openlibrary.org/b/id/${match.cover_i}-L.jpg`)
          if (img) return { ...img, source: 'OpenLibrary (Title)' }
        }
      }
    } catch {}
  }

  return null
}

async function processBook(book) {
  try {
    const cover = await searchCover(book.isbn, book.title, book.search_author)
    if (!cover) return { success: false, reason: 'not_found' }

    const extension = cover.contentType.split('/')[1]?.split(';')[0]?.trim() || 'jpg'
    const filePath = `library-books/${book.id}/cover-${crypto.randomUUID()}.${extension}`

    const { error: uploadError } = await supabase.storage
      .from('artwork-images')
      .upload(filePath, Buffer.from(cover.arrayBuffer), {
        contentType: cover.contentType,
        upsert: false,
      })

    if (uploadError) {
      return { success: false, reason: 'upload_error', error: uploadError.message }
    }

    const { data: publicUrlData } = supabase.storage.from('artwork-images').getPublicUrl(filePath)

    const { error: updateError } = await supabase
      .from('library_books')
      .update({ cover_image_url: publicUrlData.publicUrl })
      .eq('id', book.id)

    if (updateError) {
      return { success: false, reason: 'update_error', error: updateError.message }
    }

    return { success: true, source: cover.source, size: cover.byteLength }
  } catch (err) {
    return { success: false, reason: 'exception', error: err.message }
  }
}

async function main() {
  const isTest = process.argv.includes('--test')
  const batchSize = isTest ? 100 : 200

  console.log(`Starting cover import (${isTest ? 'TEST MODE: 100 books' : 'FULL RUN: all books with ISBN'})...`)

  let totalProcessed = 0
  let totalImported = 0
  let totalNotFound = 0
  let totalErrors = 0
  const sourcesCount = {}
  let lastLegacyNo = 0

  while (true) {
    const { data: books, error } = await supabase
      .from('library_books')
      .select('id, legacy_no, isbn, title, search_author')
      .is('cover_image_url', null)
      .not('isbn', 'is', null)
      .neq('isbn', '')
      .gt('legacy_no', lastLegacyNo)
      .order('legacy_no', { ascending: true })
      .limit(batchSize)

    if (error) {
      console.error('Database query error:', error)
      break
    }

    if (!books || books.length === 0) {
      console.log('\nFinished traversing all books with ISBN!')
      break
    }

    lastLegacyNo = books[books.length - 1].legacy_no

    // Process with concurrency
    const CONCURRENCY = 15
    for (let i = 0; i < books.length; i += CONCURRENCY) {
      const chunk = books.slice(i, i + CONCURRENCY)
      const results = await Promise.all(
        chunk.map(async (book) => {
          const res = await processBook(book)
          return { book, res }
        })
      )

      for (const { book, res } of results) {
        totalProcessed++
        if (res.success) {
          totalImported++
          sourcesCount[res.source] = (sourcesCount[res.source] || 0) + 1
          console.log(`[+] [#${book.legacy_no}] "${(book.title || '').slice(0, 45)}" -> ${res.source} (${Math.round(res.size / 1024)} KB)`)
        } else if (res.reason === 'not_found') {
          totalNotFound++
        } else {
          totalErrors++
          console.warn(`[!] [#${book.legacy_no}] error: ${res.reason} ${res.error || ''}`)
        }
      }

      process.stdout.write(`Processed: ${totalProcessed} | Found: ${totalImported} | Not Found: ${totalNotFound} | Errors: ${totalErrors}\r`)
    }

    if (isTest) break
  }

  console.log('\n\n================ SUMMARY ================')
  console.log(`Total processed: ${totalProcessed}`)
  console.log(`Total imported:  ${totalImported} (${totalProcessed ? ((totalImported / totalProcessed) * 100).toFixed(1) : 0}%)`)
  console.log(`Not found:       ${totalNotFound}`)
  console.log(`Errors:          ${totalErrors}`)
  console.log('Sources breakdown:', sourcesCount)
  console.log('=========================================\n')
}

main().catch(console.error)
