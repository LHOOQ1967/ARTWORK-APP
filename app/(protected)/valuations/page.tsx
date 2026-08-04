'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

const CURRENCIES = ['CHF', 'EUR', 'USD', 'GBP', 'HKD'] as const

type Contact = {
  id: string
  company_name: string | null
  first_name: string | null
  last_name: string | null
}

type Artwork = {
  id: string
  title: string | null
  year_execution: number | null
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
  created_at: string
}

type Draft = {
  amount: string
  currency: string
  notes: string
}

type ValuationEntry = {
  artworkId: string
  expertContactId: string
  amount: number
  currency: string
  notes: string
}

function contactLabel(contact: Contact) {
  return (
    contact.company_name ||
    [contact.first_name, contact.last_name].filter(Boolean).join(' ') ||
    'Contact sans nom'
  )
}

function artworkLabel(artwork: Artwork) {
  const artist = artwork.artist
    ? [artwork.artist.first_name, artwork.artist.last_name].filter(Boolean).join(' ')
    : ''
  const title = [artwork.title, artwork.year_execution].filter(Boolean).join(', ')
  return [artist, title].filter(Boolean).join(' — ') || 'Œuvre sans titre'
}

function compareArtworks(first: Artwork, second: Artwork) {
  const compare = (firstValue: string | null | undefined, secondValue: string | null | undefined) =>
    (firstValue ?? '').localeCompare(secondValue ?? '', 'fr', {
      sensitivity: 'base',
    })

  return (
    compare(first.artist?.last_name, second.artist?.last_name) ||
    compare(first.artist?.first_name, second.artist?.first_name) ||
    compare(first.title, second.title) ||
    (first.year_execution ?? 0) - (second.year_execution ?? 0)
  )
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

export default function ValuationsEntryPage() {
  const [artworks, setArtworks] = useState<Artwork[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [valuations, setValuations] = useState<Valuation[]>([])
  const [valuationDate, setValuationDate] = useState(today)
  const [firstExpertId, setFirstExpertId] = useState('')
  const [secondExpertId, setSecondExpertId] = useState('')
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadData() {
      const response = await fetch('/api/valuations')
      const payload = (await response.json()) as {
        artworks?: Artwork[]
        contacts?: Contact[]
        valuations?: Valuation[]
        error?: string
      }

      if (cancelled) return

      if (!response.ok) {
        setError(payload.error ?? 'Impossible de charger les évaluations.')
      } else {
        setArtworks(payload.artworks ?? [])
        setContacts(payload.contacts ?? [])
        setValuations(payload.valuations ?? [])
      }
      setLoading(false)
    }

    void loadData()
    return () => {
      cancelled = true
    }
  }, [])

  const selectedExperts = useMemo(
    () => [firstExpertId, secondExpertId].filter(Boolean),
    [firstExpertId, secondExpertId]
  )

  const sortedArtworks = useMemo(
    () => [...artworks].sort(compareArtworks),
    [artworks]
  )

  function draftKey(artworkId: string, expertId: string) {
    return `${valuationDate}:${artworkId}:${expertId}`
  }

  function existingValuation(artworkId: string, expertId: string) {
    return valuations.find(
      (valuation) =>
        valuation.artwork_id === artworkId &&
        valuation.expert_contact_id === expertId &&
        valuation.valuation_date === valuationDate
    )
  }

  function getDraft(artworkId: string, expertId: string): Draft {
    const key = draftKey(artworkId, expertId)
    const draft = drafts[key]
    if (draft) return draft

    const existing = existingValuation(artworkId, expertId)
    return {
      amount: existing ? String(existing.amount) : '',
      currency: existing?.currency ?? 'EUR',
      notes: existing?.notes ?? '',
    }
  }

  function updateDraft(
    artworkId: string,
    expertId: string,
    changes: Partial<Draft>
  ) {
    const key = draftKey(artworkId, expertId)
    setDrafts((previous) => ({
      ...previous,
      [key]: { ...getDraft(artworkId, expertId), ...changes },
    }))
  }

  async function saveValuations() {
    setError('')
    setNotice('')

    if (selectedExperts.length === 0) {
      setError('Sélectionnez au moins un expert issu des contacts.')
      return
    }

    const entries: ValuationEntry[] = []
    let hasInvalidAmount = false

    for (const artwork of artworks) {
      for (const expertContactId of selectedExperts) {
        const draft = getDraft(artwork.id, expertContactId)
        if (draft.amount.trim() === '') continue

        const amount = Number(draft.amount.replace(/'/g, '').replace(',', '.'))
        if (!Number.isFinite(amount) || amount < 0) {
          hasInvalidAmount = true
          continue
        }

        entries.push({
          artworkId: artwork.id,
          expertContactId,
          amount,
          currency: draft.currency,
          notes: draft.notes,
        })
      }
    }

    if (hasInvalidAmount) {
      setError('Les montants doivent être des nombres positifs ou nuls.')
      return
    }

    if (entries.length === 0) {
      setError('Saisissez au moins un montant avant d’enregistrer.')
      return
    }

    setSaving(true)
    const response = await fetch('/api/valuations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ valuationDate, valuations: entries }),
    })
    const payload = (await response.json()) as {
      valuations?: Valuation[]
      error?: string
    }
    setSaving(false)

    if (!response.ok) {
      setError(payload.error ?? 'Impossible d’enregistrer les évaluations.')
      return
    }

    const saved = payload.valuations ?? []
    setValuations((previous) => [
      ...previous.filter(
        (valuation) =>
          !saved.some((item) => item.id === valuation.id)
      ),
      ...saved,
    ])
    setDrafts({})
    setNotice(`${saved.length} évaluation${saved.length > 1 ? 's' : ''} enregistrée${saved.length > 1 ? 's' : ''}.`)
  }

  return (
    <div className="p-6 pt-20 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Saisie des évaluations</h1>
          <p className="text-sm text-gray-600">
            Renseignez un ou deux experts et leurs montants pour la date d’évaluation.
          </p>
        </div>
        <Link className="edit-button" href="/valuations/history">
          Consulter l’historique
        </Link>
      </div>

      <div className="grid gap-4 rounded border bg-gray-50 p-4 md:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Date d’évaluation
          <input
            className="rounded border bg-white px-3 py-2"
            type="date"
            value={valuationDate}
            onChange={(event) => setValuationDate(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Expert 1
          <select
            className="rounded border bg-white px-3 py-2"
            value={firstExpertId}
            onChange={(event) => setFirstExpertId(event.target.value)}
          >
            <option value="">Sélectionner un contact</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id} disabled={contact.id === secondExpertId}>
                {contactLabel(contact)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Expert 2
          <select
            className="rounded border bg-white px-3 py-2"
            value={secondExpertId}
            onChange={(event) => setSecondExpertId(event.target.value)}
          >
            <option value="">Sélectionner un contact</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id} disabled={contact.id === firstExpertId}>
                {contactLabel(contact)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="rounded border border-red-300 bg-red-50 p-3 text-red-800">{error}</p>}
      {notice && <p className="rounded border border-green-300 bg-green-50 p-3 text-green-800">{notice}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : (
        <div className="overflow-x-auto rounded border">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead className="bg-gray-50 text-left">
              <tr className="border-b">
                <th className="p-3">Œuvre</th>
                {[firstExpertId, secondExpertId].map((expertId, index) => (
                  <th key={index} className="min-w-[260px] p-3">
                    {expertId
                      ? contactLabel(
                          contacts.find((contact) => contact.id === expertId) ?? {
                            id: expertId,
                            company_name: null,
                            first_name: null,
                            last_name: null,
                          }
                        )
                      : `Expert ${index + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedArtworks.map((artwork) => (
                <tr key={artwork.id} className="border-b align-top">
                  <td className="p-3 font-medium">{artworkLabel(artwork)}</td>
                  {[firstExpertId, secondExpertId].map((expertId, index) => {
                    if (!expertId) {
                      return <td key={index} className="p-3 text-gray-400">Sélectionnez un expert</td>
                    }
                    const draft = getDraft(artwork.id, expertId)
                    return (
                      <td key={expertId} className="p-3">
                        <div className="flex gap-2">
                          <select
                            aria-label={`Devise de l’évaluation de ${artworkLabel(artwork)}`}
                            className="w-20 rounded border bg-white px-2 py-1"
                            value={draft.currency}
                            onChange={(event) =>
                              updateDraft(artwork.id, expertId, { currency: event.target.value })
                            }
                          >
                            {CURRENCIES.map((currency) => (
                              <option key={currency} value={currency}>{currency}</option>
                            ))}
                          </select>
                          <input
                            aria-label={`Montant de l’évaluation de ${artworkLabel(artwork)}`}
                            className="w-full rounded border px-2 py-1 text-right"
                            inputMode="decimal"
                            placeholder="Montant"
                            value={draft.amount}
                            onChange={(event) =>
                              updateDraft(artwork.id, expertId, { amount: event.target.value })
                            }
                          />
                        </div>
                        <input
                          aria-label={`Note d’évaluation de ${artworkLabel(artwork)}`}
                          className="mt-2 w-full rounded border px-2 py-1"
                          placeholder="Note facultative"
                          value={draft.notes}
                          onChange={(event) =>
                            updateDraft(artwork.id, expertId, { notes: event.target.value })
                          }
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        type="button"
        className="edit-button"
        disabled={saving || loading}
        onClick={() => void saveValuations()}
      >
        {saving ? 'Enregistrement…' : 'Enregistrer les évaluations'}
      </button>
    </div>
  )
}
