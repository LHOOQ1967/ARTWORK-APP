'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSessionProfile } from '@/contexts/SessionContext'

type Contact = {
  id: string
  company_name: string | null
  first_name: string | null
  last_name: string | null
}

type RequestRecord = {
  id: string
  request_date: string
  contact_id: string
  search: string
  budget: string | null
  status: string
  notes: string | null
  contact: Contact | null
}

const statuses = ['Open', 'In progress', 'Found', 'Closed']

function contactLabel(contact: Contact | null) {
  return contact?.company_name || [contact?.first_name, contact?.last_name].filter(Boolean).join(' ') || 'Contact sans nom'
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

export default function BuyerSearchesPage() {
  const router = useRouter()
  const { role } = useSessionProfile()
  const canEdit = role === 'Editor' || role === 'Administrator'
  const [requests, setRequests] = useState<RequestRecord[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [form, setForm] = useState({ requestDate: today(), contactId: '', search: '', budget: '', status: 'Open', notes: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')

  useEffect(() => {
    if (role && !canEdit) router.replace('/not-authorized')
  }, [canEdit, role, router])

  async function load() {
    const response = await fetch('/api/buyer-searches')
    const payload = await response.json()
    if (!response.ok) setError(payload.error ?? 'Impossible de charger les demandes.')
    else {
      setRequests(payload.requests ?? [])
      setContacts(payload.contacts ?? [])
      setWarning(payload.warning ?? '')
    }
    setLoading(false)
  }

  useEffect(() => {
    if (!canEdit) return
    let active = true

    void fetch('/api/buyer-searches')
      .then(async (response) => ({ response, payload: await response.json() }))
      .then(({ response, payload }) => {
        if (!active) return
        if (!response.ok) setError(payload.error ?? 'Impossible de charger les demandes.')
        else {
          setRequests(payload.requests ?? [])
          setContacts(payload.contacts ?? [])
          setWarning(payload.warning ?? '')
        }
        setLoading(false)
      })
      .catch(() => {
        if (!active) return
        setError('Impossible de charger les demandes.')
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [canEdit])

  const filteredRequests = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('fr')
    return requests.filter((item) => {
      const haystack = `${contactLabel(item.contact)} ${item.search} ${item.budget ?? ''} ${item.notes ?? ''}`.toLocaleLowerCase('fr')
      return (!normalized || haystack.includes(normalized)) && (!statusFilter || item.status === statusFilter)
    })
  }, [query, requests, statusFilter])

  if (!canEdit) return null

  function resetForm() {
    setEditingId(null)
    setForm({ requestDate: today(), contactId: '', search: '', budget: '', status: 'Open', notes: '' })
  }

  function edit(item: RequestRecord) {
    setEditingId(item.id)
    setForm({ requestDate: item.request_date, contactId: item.contact_id, search: item.search, budget: item.budget ?? '', status: item.status, notes: item.notes ?? '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function save() {
    setError('')
    if (!form.contactId || !form.search.trim()) { setError('Le contact et la recherche sont obligatoires.'); return }
    setSaving(true)
    const response = await fetch('/api/buyer-searches', { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, id: editingId }) })
    const payload = await response.json()
    setSaving(false)
    if (!response.ok) { setError(payload.error ?? 'Enregistrement impossible.'); return }
    await load()
    resetForm()
  }

  async function remove(id: string) {
    if (!window.confirm('Supprimer cette demande ?')) return
    const response = await fetch(`/api/buyer-searches?id=${id}`, { method: 'DELETE' })
    if (!response.ok) { const payload = await response.json(); setError(payload.error ?? 'Suppression impossible.'); return }
    setRequests((current) => current.filter((item) => item.id !== id))
    if (editingId === id) resetForm()
  }

  return (
    <main style={{ minHeight: '100vh', padding: '92px 20px 56px', background: '#f3f5f1' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ marginBottom: 26 }}>
          <div className="entity-form-eyebrow" style={{ color: '#557067', fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Sales intelligence</div>
          <h1 style={{ margin: '7px 0 8px', color: '#143b2d', fontSize: 42, lineHeight: 1 }}>Buyer searches</h1>
          <p style={{ margin: 0, color: '#62736c' }}>Enregistrez les recherches d&apos;acheteurs, puis retrouvez-les par contact, artiste, période, taille ou budget.</p>
        </div>

        {canEdit && <section style={panelStyle}>
          <h2 style={headingStyle}>{editingId ? 'Modifier la demande' : 'Nouvelle demande'}</h2>
          <div style={formGridStyle}>
            <label>Date<input type="date" value={form.requestDate} onChange={(e) => setForm({ ...form, requestDate: e.target.value })} style={fieldStyle} /></label>
            <label>Contact<select value={form.contactId} onChange={(e) => setForm({ ...form, contactId: e.target.value })} style={fieldStyle}><option value="">Sélectionner…</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contactLabel(contact)}</option>)}</select></label>
            <label>Budget<input placeholder="Ex. EUR 50'000–80'000" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} style={fieldStyle} /></label>
            <label>Statut<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={fieldStyle}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
            <label style={{ gridColumn: '1 / -1' }}>Recherche<textarea rows={3} placeholder="Ex. peinture de l'artiste X, années 1960, largeur max. 80 cm…" value={form.search} onChange={(e) => setForm({ ...form, search: e.target.value })} style={fieldStyle} /></label>
            <label style={{ gridColumn: '1 / -1' }}>Notes<textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={fieldStyle} /></label>
          </div>
          {warning && <p style={{ color: '#8a6116', margin: '12px 0' }}>{warning}</p>}
          {error && <p style={{ color: '#a33b32', margin: '12px 0' }}>{error}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button onClick={resetForm} disabled={!editingId && !form.search}>Annuler</button><button onClick={() => void save()} disabled={saving}>{saving ? 'Enregistrement…' : editingId ? 'Enregistrer' : 'Ajouter la demande'}</button></div>
        </section>}

        <section style={panelStyle}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}><input placeholder="Rechercher dans les demandes…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ ...fieldStyle, flex: '1 1 320px', margin: 0 }} /><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...fieldStyle, width: 170, margin: 0 }}><option value="">Tous les statuts</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select></div>
          {loading ? <p>Chargement…</p> : filteredRequests.length === 0 ? <p style={{ color: '#62736c' }}>Aucune demande enregistrée.</p> : <div style={{ display: 'grid', gap: 10 }}>{filteredRequests.map((item) => <article key={item.id} style={rowStyle}><div style={{ minWidth: 0, flex: 1 }}><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}><strong>{contactLabel(item.contact)}</strong><span style={{ color: '#62736c', fontSize: 13 }}>{new Intl.DateTimeFormat('fr-CH').format(new Date(`${item.request_date}T00:00:00`))}</span><span style={statusStyle}>{item.status}</span></div><p style={{ margin: '8px 0 4px', whiteSpace: 'pre-wrap' }}>{item.search}</p><div style={{ color: '#62736c', fontSize: 14 }}>{item.budget || 'Budget non précisé'}{item.notes ? ` · ${item.notes}` : ''}</div></div>{canEdit && <div style={{ display: 'flex', gap: 6 }}><button onClick={() => edit(item)}>Modifier</button><button onClick={() => void remove(item.id)}>Supprimer</button></div>}</article>)}</div>}
        </section>
      </div>
    </main>
  )
}

const panelStyle: React.CSSProperties = { background: '#fff', border: '1px solid #d7dfda', borderRadius: 12, padding: 24, marginBottom: 20, boxShadow: '0 10px 28px rgba(31,56,46,0.06)' }
const headingStyle: React.CSSProperties = { margin: '0 0 18px', color: '#173f31', fontSize: 22 }
const formGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 18 }
const fieldStyle: React.CSSProperties = { display: 'block', width: '100%', minHeight: 42, marginTop: 6, padding: '9px 12px', border: '1px solid #c9d3cd', borderRadius: 8, background: '#fff', boxSizing: 'border-box' }
const rowStyle: React.CSSProperties = { display: 'flex', gap: 16, alignItems: 'flex-start', padding: '16px 0', borderTop: '1px solid #e4e9e6' }
const statusStyle: React.CSSProperties = { color: '#27634c', background: '#e8f1eb', borderRadius: 999, padding: '3px 8px', fontSize: 12, fontWeight: 700 }