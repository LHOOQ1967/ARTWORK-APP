'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import SearchSelect from '@/components/ui/SearchSelect'
import { fetchWithAuth } from '@/lib/fetchWithAuth'
import { privateImageUrl } from '@/lib/privateImageUrl'
import { addressLabel, type ContactAddress } from '@/components/contacts/ContactAddressSelect'

const CURRENCIES = ['CHF', 'EUR', 'USD', 'GBP', 'HKD'] as const

type ContactRef = {
  id: string
  company_name: string | null
  first_name: string | null
  last_name: string | null
}

type Quote = {
  id: string
  transport_id: string
  carrier_contact_id: string | null
  quote_date: string | null
  amount: number | null
  currency: string
  submitted_to_buyer_date: string | null
  accepted_date: string | null
  quote_pdf_url: string | null
}

type Transport = {
  id: string
  artwork_id: string
  origin_contact_id: string | null
  destination_contact_id: string | null
  instruction_contact_id: string | null
  instruction_date: string | null
  transport_date: string | null
  arrival_date: string | null
  notes: string | null
  final_invoice_pdf_url: string | null
  image_url: string | null
  artwork: {
    title: string | null
    year_execution: number | null
    artist: { first_name: string | null; last_name: string | null } | null
    location: ContactRef | null
    location_address: Partial<ContactAddress> | null
    artwork_destination_address: Partial<ContactAddress> | null
    artwork_destination: ContactRef | null
  } | null
  origin: ContactRef | null
  origin_address: Partial<ContactAddress> | null
  destination_address: Partial<ContactAddress> | null
  destination: ContactRef | null
  quotes: Quote[]
}

type ArtworkOption = {
  id: string
  title: string | null
  year_execution: number | null
  status: string | null
  location_contact_id: string | null
  destination_contact_id: string | null
  location_address_id: string | null
  destination_address_id: string | null
  artist: { first_name: string | null; last_name: string | null } | null
}

type HistoryRow = {
  id: string
  started_at: string
  ended_at: string | null
  contact: ContactRef | null
  address: Partial<ContactAddress> | null
}

function contactLabel(contact: ContactRef | null | undefined) {
  if (!contact) return '—'
  return (
    contact.company_name ||
    [contact.first_name, contact.last_name].filter(Boolean).join(' ') ||
    'Contact sans nom'
  )
}

function artworkLabel(artwork: Transport['artwork'] | ArtworkOption | null) {
  if (!artwork) return 'Œuvre inconnue'
  const artist = artwork.artist
    ? [artwork.artist.first_name, artwork.artist.last_name].filter(Boolean).join(' ')
    : ''
  const title = [artwork.title, artwork.year_execution].filter(Boolean).join(', ')
  return [artist, title].filter(Boolean).join(' — ') || 'Œuvre sans titre'
}

function PlaceLine({
  label,
  contact,
  address,
}: Readonly<{
  label: string
  contact: ContactRef | null | undefined
  address: Partial<ContactAddress> | null | undefined
}>) {
  return (
    <p>
      {label}: <span className="font-semibold">{contactLabel(contact)}</span>
      {address && <span className="block text-sm text-gray-600">{addressLabel(address)}</span>}
    </p>
  )
}

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('fr-CH')
}

function transportStatus(transport: Transport) {
  if (transport.arrival_date) return 'Arrivée'
  if (transport.transport_date) return 'En transport'
  if (transport.instruction_date) return 'Instruit'
  if (transport.quotes.some((quote) => quote.accepted_date)) return 'Devis accepté'
  if (transport.quotes.length > 0) return 'Devis en cours'
  return 'À organiser'
}

const STATUSES = [
  'À organiser',
  'Devis en cours',
  'Devis accepté',
  'Instruit',
  'En transport',
  'Arrivée',
]

async function send(url: string, method: string, body?: unknown) {
  const response = await fetchWithAuth(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(payload.error ?? 'Opération impossible.')
  }
}

export default function TransportsPage() {
  const [transports, setTransports] = useState<Transport[]>([])
  const [artworks, setArtworks] = useState<ArtworkOption[]>([])
  const [contacts, setContacts] = useState<ContactRef[]>([])
  const [canEdit, setCanEdit] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [newArtworkId, setNewArtworkId] = useState('all')

  const load = useCallback(async () => {
    const response = await fetchWithAuth('/api/transports')
    const payload = (await response.json().catch(() => ({}))) as {
      transports?: Transport[]
      artworks?: ArtworkOption[]
      contacts?: ContactRef[]
      canEdit?: boolean
      error?: string
    }
    if (!response.ok) {
      setError(payload.error ?? 'Impossible de charger les transports.')
    } else {
      setTransports(payload.transports ?? [])
      setArtworks(payload.artworks ?? [])
      setContacts(payload.contacts ?? [])
      setCanEdit(Boolean(payload.canEdit))
      setError('')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const contactOptions = useMemo(
    () => contacts.map((contact) => ({ id: contact.id, label: contactLabel(contact) })),
    [contacts]
  )
  const artworkOptions = useMemo(
    () =>
      [...artworks]
        .sort((a, b) => Number(b.status === 'Bought') - Number(a.status === 'Bought'))
        .map((artwork) => ({
        id: artwork.id,
        label: artwork.status
          ? `${artworkLabel(artwork)} [${artwork.status}]`
          : artworkLabel(artwork),
      })),
    [artworks]
  )

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return transports.filter(
      (transport) =>
        (!statusFilter || transportStatus(transport) === statusFilter) &&
        (!needle || artworkLabel(transport.artwork).toLowerCase().includes(needle))
    )
  }, [transports, statusFilter, search])

  async function run(action: () => Promise<void>) {
    try {
      setError('')
      await action()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opération impossible.')
    }
  }

  async function createTransport() {
    const artwork = artworks.find((item) => item.id === newArtworkId)
    if (!artwork) return
    setCreating(true)
    await run(async () => {
      await send('/api/transports', 'POST', {
        artwork_id: artwork.id,
        origin_contact_id: artwork.location_contact_id,
        destination_contact_id: artwork.destination_contact_id,
        origin_address_id: artwork.location_address_id,
        destination_address_id: artwork.destination_address_id,
      })
      setNewArtworkId('all')
    })
    setCreating(false)
  }

  return (
    <div className="p-6 pt-20 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Transports</h1>
          <p className="text-sm text-gray-600">
            Devis, instructions et livraisons des œuvres.
          </p>
        </div>
        <Link className="edit-button" href="/">
          Accueil
        </Link>
      </div>

      {error && <p className="rounded border border-red-300 bg-red-50 p-3 text-red-800">{error}</p>}

      {canEdit && (
        <section className="flex flex-wrap items-end gap-3 rounded border bg-gray-50 p-4">
          <SearchSelect
            label="Nouveau transport pour l’œuvre"
            valueId={newArtworkId}
            onChangeId={setNewArtworkId}
            options={artworkOptions}
            allLabel="Effacer"
          />
          <button
            className="edit-button"
            type="button"
            disabled={newArtworkId === 'all' || creating}
            onClick={() => void createTransport()}
          >
            Créer le transport
          </button>
        </section>
      )}

      <section className="flex flex-wrap gap-3">
        <input
          className="rounded border bg-white px-3 py-2"
          placeholder="Rechercher une œuvre"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          className="rounded border bg-white px-3 py-2"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="">Tous les statuts</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </section>

      {loading ? (
        <p>Chargement…</p>
      ) : visible.length === 0 ? (
        <p className="text-gray-600">Aucun transport.</p>
      ) : (
        <div className="space-y-4">
          {visible.map((transport) => (
            <TransportCard
              key={`${transport.id}:${transport.quotes.map((q) => q.id).join(',')}`}
              transport={transport}
              canEdit={canEdit}
              contactOptions={contactOptions}
              run={run}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TransportCard({
  transport,
  canEdit,
  contactOptions,
  run,
}: Readonly<{
  transport: Transport
  canEdit: boolean
  contactOptions: { id: string; label: string }[]
  run: (action: () => Promise<void>) => Promise<void>
}>) {
  const [dates, setDates] = useState({
    instruction_date: transport.instruction_date ?? '',
    transport_date: transport.transport_date ?? '',
    arrival_date: transport.arrival_date ?? '',
  })
  const [instructionContactId, setInstructionContactId] = useState(
    transport.instruction_contact_id ?? 'all'
  )
  const [notes, setNotes] = useState(transport.notes ?? '')
  const [finalInvoicePdfUrl, setFinalInvoicePdfUrl] = useState(
    transport.final_invoice_pdf_url ?? ''
  )
  const [history, setHistory] = useState<HistoryRow[] | null>(null)

  async function toggleHistory() {
    if (history) {
      setHistory(null)
      return
    }
    const response = await fetchWithAuth(`/api/transports?artworkId=${transport.artwork_id}`)
    const payload = (await response.json().catch(() => ({}))) as { history?: HistoryRow[] }
    setHistory(payload.history ?? [])
  }

  const dateField = (key: keyof typeof dates, label: string) => (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      <input
        type="date"
        className="rounded border bg-white px-3 py-2"
        disabled={!canEdit}
        value={dates[key]}
        onChange={(event) => setDates((prev) => ({ ...prev, [key]: event.target.value }))}
      />
    </label>
  )

  return (
    <section className="space-y-4 rounded border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-4">
          {transport.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={privateImageUrl(transport.image_url)}
              alt={transport.artwork?.title ?? 'Artwork'}
              className="h-28 w-28 rounded object-cover"
            />
          ) : (
            <div className="flex h-28 w-28 items-center justify-center rounded bg-gray-100 text-xs text-gray-400">
              img
            </div>
          )}
        <div>
          <Link
            className="underline"
            href={`/artworks/${transport.artwork_id}`}
          >
            {artworkLabel(transport.artwork)}
          </Link>
          <div className="mt-2 grid gap-x-8 gap-y-1 text-base sm:grid-cols-2">
            {transport.arrival_date ? (
              <>
                <PlaceLine
                  label="Previous location"
                  contact={transport.origin}
                  address={transport.origin_address}
                />
                <PlaceLine
                  label="Delivered to"
                  contact={transport.destination}
                  address={transport.destination_address}
                />
              </>
            ) : (
              <>
                <PlaceLine
                  label="Current location"
                  contact={transport.artwork?.location}
                  address={transport.artwork?.location_address}
                />
                <PlaceLine
                  label="Destination"
                  contact={transport.destination ?? transport.artwork?.artwork_destination}
                  address={
                    transport.destination_address ?? transport.artwork?.artwork_destination_address
                  }
                />
              </>
            )}
          </div>
        </div>
        </div>
        <span className="rounded bg-gray-100 px-3 py-1 text-sm font-medium">
          {transportStatus(transport)}
        </span>
      </div>

      <div>
        <h3 className="mb-2 font-semibold">Devis</h3>
        <div className="space-y-2">
          {transport.quotes.length === 0 && (
            <p className="text-sm text-gray-600">Aucun devis.</p>
          )}
          {transport.quotes.map((quote) => (
            <QuoteRow
              key={quote.id}
              quote={quote}
              canEdit={canEdit}
              contactOptions={contactOptions}
              run={run}
            />
          ))}
        </div>
        {canEdit && (
          <button
            className="edit-button mt-2"
            type="button"
            onClick={() =>
              void run(() =>
                send(`/api/transports/${transport.id}/quotes`, 'POST', {
                  quote_date: new Date().toISOString().slice(0, 10),
                })
              )
            }
          >
            Ajouter un devis
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Lien PDF de la facture finale
          <input
            type="url"
            className="w-80 rounded border bg-white px-3 py-2"
            disabled={!canEdit}
            placeholder="https://..."
            value={finalInvoicePdfUrl}
            onChange={(event) => setFinalInvoicePdfUrl(event.target.value)}
          />
        </label>
        {transport.final_invoice_pdf_url && (
          <a
            className="pb-2 text-sm font-medium text-blue-700 underline"
            href={transport.final_invoice_pdf_url}
            target="_blank"
            rel="noreferrer"
          >
            PDF de la facture finale
          </a>
        )}
      </div>

      <div className="grid items-end gap-3 md:grid-cols-4">
        {dateField('instruction_date', 'Instructions de transport')}
        {canEdit ? (
          <SearchSelect
            label="Instructions données à"
            valueId={instructionContactId}
            onChangeId={setInstructionContactId}
            options={contactOptions}
            allLabel="Effacer"
            className="!min-w-0"
          />
        ) : (
          <div className="flex flex-col gap-1 text-sm font-medium">
            Instructions données à
            <span className="py-2 font-normal">
              {contactOptions.find((o) => o.id === transport.instruction_contact_id)?.label ??
                '—'}
            </span>
          </div>
        )}
        {dateField('transport_date', 'Date du transport')}
        {dateField('arrival_date', 'Arrivée à destination')}
        <label className="flex flex-col gap-1 text-sm font-medium">
          Notes
          <input
            className="rounded border bg-white px-3 py-2"
            disabled={!canEdit}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        {canEdit && (
          <>
            <button
              className="edit-button"
              type="button"
              onClick={() =>
                void run(() =>
                  send(`/api/transports/${transport.id}`, 'PATCH', {
                    instruction_date: dates.instruction_date || null,
                    instruction_contact_id:
                      instructionContactId === 'all' ? null : instructionContactId,
                    transport_date: dates.transport_date || null,
                    arrival_date: dates.arrival_date || null,
                    notes,
                    final_invoice_pdf_url: finalInvoicePdfUrl || null,
                  })
                )
              }
            >
              Enregistrer
            </button>
            <button
              className="edit-button"
              type="button"
              onClick={() => {
                if (!window.confirm('Supprimer ce transport et ses devis ?')) return
                void run(() => send(`/api/transports/${transport.id}`, 'DELETE'))
              }}
            >
              Supprimer
            </button>
          </>
        )}
        <button className="edit-button" type="button" onClick={() => void toggleHistory()}>
          {history ? 'Masquer l’historique' : 'Historique des localisations'}
        </button>
      </div>

      {history && (
        <ul className="text-sm">
          {history.length === 0 && <li className="text-gray-600">Aucun historique.</li>}
          {history.map((row) => (
            <li key={row.id}>
              {contactLabel(row.contact)}{row.address ? ` (${addressLabel(row.address)})` : ''} — depuis le {formatDate(row.started_at)}
              {row.ended_at ? ` jusqu’au ${formatDate(row.ended_at)}` : ' (actuelle)'}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function QuoteRow({
  quote,
  canEdit,
  contactOptions,
  run,
}: Readonly<{
  quote: Quote
  canEdit: boolean
  contactOptions: { id: string; label: string }[]
  run: (action: () => Promise<void>) => Promise<void>
}>) {
  const [draft, setDraft] = useState({
    carrier_contact_id: quote.carrier_contact_id ?? 'all',
    quote_date: quote.quote_date ?? '',
    amount: quote.amount === null ? '' : String(quote.amount),
    currency: quote.currency,
    submitted_to_buyer_date: quote.submitted_to_buyer_date ?? '',
    accepted_date: quote.accepted_date ?? '',
    quote_pdf_url: quote.quote_pdf_url ?? '',
  })

  const set = (key: keyof typeof draft, value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }))

  const input = 'rounded border bg-white px-3 py-2'
  const label = 'flex flex-col gap-1 text-sm font-medium'

  return (
    <div className="flex flex-wrap items-end gap-3 rounded border bg-gray-50 p-3">
      <label className={label}>
        Date du devis
        <input type="date" className={input} disabled={!canEdit} value={draft.quote_date}
          onChange={(event) => set('quote_date', event.target.value)} />
      </label>
      {canEdit ? (
        <SearchSelect
          label="Transporteur"
          valueId={draft.carrier_contact_id}
          onChangeId={(id) => set('carrier_contact_id', id)}
          options={contactOptions}
          allLabel="Effacer"
        />
      ) : (
        <div className={label}>
          Transporteur
          <span className="py-2">
            {contactOptions.find((option) => option.id === quote.carrier_contact_id)?.label ?? '—'}
          </span>
        </div>
      )}
      <label className={label}>
        Montant
        <span className="flex gap-1">
          <input type="number" min="0" step="0.01" className={`${input} w-32`} disabled={!canEdit}
            value={draft.amount} onChange={(event) => set('amount', event.target.value)} />
          <select className={input} disabled={!canEdit} value={draft.currency}
            onChange={(event) => set('currency', event.target.value)}>
            {CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>{currency}</option>
            ))}
          </select>
        </span>
      </label>
      <label className={label}>
        Soumis à l’acheteur
        <input type="date" className={input} disabled={!canEdit} value={draft.submitted_to_buyer_date}
          onChange={(event) => set('submitted_to_buyer_date', event.target.value)} />
      </label>
      <label className={label}>
        Accepté le
        <input type="date" className={input} disabled={!canEdit} value={draft.accepted_date}
          onChange={(event) => set('accepted_date', event.target.value)} />
      </label>
      <label className={label}>
        Lien PDF du devis (OneDrive)
        <input
          type="url"
          className={`${input} w-64`}
          disabled={!canEdit}
          placeholder="https://..."
          value={draft.quote_pdf_url}
          onChange={(event) => set('quote_pdf_url', event.target.value)}
        />
      </label>
      {quote.quote_pdf_url && (
        <a
          className="pb-2 text-sm font-medium text-blue-700 underline"
          href={quote.quote_pdf_url}
          target="_blank"
          rel="noreferrer"
        >
          PDF du devis
        </a>
      )}
      {canEdit && (
        <>
          <button
            className="edit-button"
            type="button"
            onClick={() =>
              void run(() =>
                send(`/api/transports/${quote.transport_id}/quotes/${quote.id}`, 'PATCH', {
                  carrier_contact_id:
                    draft.carrier_contact_id === 'all' ? null : draft.carrier_contact_id,
                  quote_date: draft.quote_date || null,
                  amount: draft.amount === '' ? null : Number(draft.amount),
                  currency: draft.currency,
                  submitted_to_buyer_date: draft.submitted_to_buyer_date || null,
                  accepted_date: draft.accepted_date || null,
                  quote_pdf_url: draft.quote_pdf_url || null,
                })
              )
            }
          >
            Enregistrer
          </button>
          <button
            className="edit-button"
            type="button"
            onClick={() =>
              void run(() =>
                send(`/api/transports/${quote.transport_id}/quotes/${quote.id}`, 'DELETE')
              )
            }
          >
            Supprimer
          </button>
        </>
      )}
    </div>
  )
}
