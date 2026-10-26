import { createHash, randomUUID } from 'node:crypto'
import { appendFileSync } from 'node:fs'

const digest = buffer => createHash('sha256').update(buffer).digest('hex')
const normalize = value => (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
function companyFor(artwork) {
  if (normalize(artwork.buyer?.company_name).includes('florac')) return 'Florac'
  if (`${normalize(artwork.buyer?.first_name)} ${normalize(artwork.buyer?.last_name)}`.trim() === 'leopold meyer') {
    return 'Léopold Meyer'
  }
  return null
}

export async function migrateCommissionInvoices({
  apply, limit, sb, gfetch, getSource, upload, buildFolder, logFile, csv,
}) {
  async function readAll(path) {
    const rows = []
    for (let offset = 0; ; offset += 500) {
      const response = await sb(`${path}&limit=500&offset=${offset}`)
      if (!response.ok) throw new Error(`Database read failed (${response.status})`)
      const page = await response.json()
      rows.push(...page)
      if (page.length < 500) return rows
    }
  }
  const artworkSelect = 'id,title,date_acquisition,cost_amount,cost_currency,auctions,sold_hammer,auction_currency,artists(first_name,last_name),buyer:contacts!artworks_buyer_contact_id_fkey(company_name,first_name,last_name)'
  const [invoices, corrections, artworks, rates, fx] = await Promise.all([
    readAll('artwork_commission_invoices?select=artwork_id,invoiced_at,invoice_url&order=artwork_id'),
    readAll('artwork_commission_correction_invoices?select=calendar_year,company,invoiced_at,invoice_url&order=calendar_year,company'),
    readAll(`artworks?select=${artworkSelect}&status=eq.Bought&date_acquisition=not.is.null&order=date_acquisition,id`),
    readAll('artwork_commission_rates?select=artwork_id,rate&order=artwork_id'),
    readAll('fx_rates_history?select=rate_date,from_currency,to_currency,rate&to_currency=eq.USD&order=rate_date,from_currency'),
  ])
  const rateIds = new Set(rates.map(row => row.artwork_id))
  const invoicedIds = new Set(invoices.map(row => row.artwork_id))
  const fxRates = new Map(fx.map(row => [`${row.rate_date}:${row.from_currency}`, Number(row.rate)]))
  const cumulativeByYear = new Map()
  const correctionArtworks = new Map()
  for (const artwork of artworks) {
    const company = companyFor(artwork)
    if (!company) continue
    const year = artwork.date_acquisition.slice(0, 4)
    const conversion = artwork.cost_currency === 'USD' ? 1 :
      fxRates.get(`${artwork.date_acquisition.slice(0, 10)}:${artwork.cost_currency}`)
    let cumulative = cumulativeByYear.get(year) ?? 0
    if (!rateIds.has(artwork.id) && conversion !== undefined && artwork.cost_amount !== null) {
      cumulative += Number(artwork.cost_amount) * conversion
    }
    cumulativeByYear.set(year, cumulative)
    const currency = artwork.auctions ? artwork.auction_currency ?? artwork.cost_currency : artwork.cost_currency
    const base = artwork.auctions ? artwork.sold_hammer : artwork.cost_amount
    const hasFx = currency === 'USD' || fxRates.has(`${artwork.date_acquisition.slice(0, 10)}:${currency}`)
    if (cumulative < 5_000_000 && !rateIds.has(artwork.id) && invoicedIds.has(artwork.id) && base !== null && hasFx) {
      const key = `${year}:${company}`
      correctionArtworks.set(key, [...(correctionArtworks.get(key) ?? []), artwork])
    }
  }
  const byId = new Map(artworks.map(row => [row.id, row]))
  const candidates = [
    ...invoices.map(row => ({
      ...row, key: row.artwork_id, table: 'artwork_commission_invoices',
      filter: `artwork_id=eq.${row.artwork_id}`,
      artworks: [byId.get(row.artwork_id)].filter(Boolean),
      label: 'Commission invoice',
    })),
    ...corrections.map(row => ({
      ...row, key: `${row.calendar_year}:${row.company}`, table: 'artwork_commission_correction_invoices',
      filter: `calendar_year=eq.${row.calendar_year}&company=eq.${encodeURIComponent(row.company)}`,
      artworks: correctionArtworks.get(`${row.calendar_year}:${row.company}`) ?? [],
      label: `Commission correction invoice ${row.calendar_year}`,
    })),
  ].filter(row => row.invoice_url && !row.invoice_url.startsWith('/api/documents/'))
  console.log(`${apply ? 'APPLY' : 'DRY-RUN'} commissions: ${candidates.length} legacy invoice links`)
  const stats = { migrated: 0, ready: 0, failed: 0 }
  function record(row, status, destination, detail) {
    appendFileSync(logFile, [row.key, status, row.invoice_url, destination, detail].map(csv).join(',') + '\n')
    console.log(`${row.key} | ${status} | ${detail}`)
  }
  for (const row of candidates.slice(0, limit)) {
    let uploaded
    const insertedIds = []
    let commitAttempted = false
    try {
      if (!row.artworks.length) throw new Error('No associated artwork found; original link preserved')
      const host = new URL(row.invoice_url).hostname
      if (!host.endsWith('.sharepoint.com') && host !== '1drv.ms') {
        throw new Error('Unsupported source host; original link preserved')
      }
      const source = await getSource({
        legacy_url: row.invoice_url,
        artworks: row.artworks[0],
      })
      const folder = buildFolder({ artwork_id: row.artworks[0].id, artworks: row.artworks[0] })
      if (!apply) {
        record(row, 'ready', folder, `${source.size} bytes; ${row.artworks.length} artwork link(s)`)
        stats.ready++
        continue
      }
      if (!source.size || source.size > 100 * 1024 * 1024) throw new Error('Invalid file size (maximum 100 MB)')
      const download = await gfetch(`/drives/${source.parentReference.driveId}/items/${source.id}/content`)
      if (!download.ok) throw new Error(`Source download failed (${download.status})`)
      const content = Buffer.from(await download.arrayBuffer())
      if (content.byteLength !== source.size) throw new Error('Source size mismatch')
      const mimeType = source.file.mimeType ?? download.headers.get('content-type')
      uploaded = await upload(folder, source.name, content, mimeType)
      const verification = await gfetch(`/drives/${uploaded.driveId}/items/${uploaded.id}/content`)
      if (!verification.ok) throw new Error(`Copy verification failed (${verification.status})`)
      const copied = Buffer.from(await verification.arrayBuffer())
      if (copied.byteLength !== content.byteLength || digest(copied) !== digest(content)) {
        throw new Error('Copy checksum mismatch')
      }
      const documents = []
      for (const artwork of row.artworks) {
        const positions = await readAll(`documents?select=position&artwork_id=eq.${artwork.id}&order=position.desc.nullslast`)
        const position = positions.reduce((max, doc) => Math.max(max, doc.position ?? -1), -1) + 1
        const id = randomUUID()
        documents.push({
          id, artwork_id: artwork.id, document_type: 'link', label: row.label,
          url: `/api/documents/${id}/open`, legacy_url: row.invoice_url,
          position, visibility: 'all_clients', recipient_contact_id: null,
          link_category: 'general', storage_provider: 'sharepoint',
          sharepoint_drive_id: uploaded.driveId, sharepoint_item_id: uploaded.id,
          sharepoint_web_url: uploaded.webUrl, file_name: uploaded.name,
          mime_type: mimeType, size_bytes: content.byteLength,
        })
      }
      const insert = await sb('documents?select=id', {
        method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(documents),
      })
      if (!insert.ok) throw new Error(`Document insertion failed (${insert.status})`)
      insertedIds.push(...(await insert.json()).map(doc => doc.id))
      if (insertedIds.length !== documents.length) throw new Error('Document insertion not confirmed')
      const target = `${row.table}?${row.filter}&invoice_url=eq.${encodeURIComponent(row.invoice_url)}`
      // Preserve the original URL in the log and document before replacing it.
      record(row, 'copy-verified', documents[0].url, `SHA-256 ${digest(content)}`)
      commitAttempted = true
      const patch = await sb(target, {
        method: 'PATCH', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ invoice_url: documents[0].url }),
      })
      if (!patch.ok) {
        commitAttempted = false
        throw new Error(`Invoice update failed (${patch.status})`)
      }
      const updated = await patch.json()
      if (updated.length !== 1 || updated[0].invoice_url !== documents[0].url) {
        commitAttempted = false
        throw new Error('Invoice changed concurrently; original link not overwritten')
      }
      const check = await readAll(`${row.table}?select=invoice_url&${row.filter}`)
      if (check.length !== 1 || check[0].invoice_url !== documents[0].url) {
        throw new Error('Persisted invoice verification failed; copied documents retained for inspection')
      }
      const savedDocs = await readAll(`documents?select=id,storage_provider,visibility&order=id&id=in.(${insertedIds.join(',')})`)
      if (savedDocs.length !== documents.length ||
          savedDocs.some(doc => doc.storage_provider !== 'sharepoint' || doc.visibility !== 'all_clients')) {
        throw new Error('Persisted document verification failed; copied documents retained for inspection')
      }
      record(row, 'migrated', documents[0].url, `${content.byteLength} bytes; ${documents.length} artwork link(s); SHA-256 verified`)
      stats.migrated++
    } catch (error) {
      if (uploaded && !commitAttempted) {
        try {
          if (insertedIds.length) {
            const deleted = await sb(`documents?id=in.(${insertedIds.join(',')})`, { method: 'DELETE' })
            if (!deleted.ok) throw new Error(`Document cleanup failed (${deleted.status})`)
          }
          const deleted = await gfetch(`/drives/${uploaded.driveId}/items/${uploaded.id}`, { method: 'DELETE' })
          if (!deleted.ok && deleted.status !== 404) throw new Error(`Copy cleanup failed (${deleted.status})`)
        } catch (cleanupError) {
          record(row, 'cleanup-failed', '', cleanupError.message)
        }
      }
      record(row, 'failed', '', error.message)
      stats.failed++
    }
  }
  console.log(`Commissions result: ${JSON.stringify(stats)}. Log: ${logFile}`)
  if (stats.failed) process.exitCode = 1
}
