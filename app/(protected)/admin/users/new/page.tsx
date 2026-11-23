'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseBrowser'

const ALL_CLIENTS = '__all_clients__'

export default function NewUserPage() {
  const router = useRouter()

  const [contacts, setContacts] = useState<any[]>([])
const [contactId, setContactId] = useState('')

  const [email, setEmail] = useState('')
  const [role, setRole] = useState('Viewer')

  const [saving, setSaving] = useState(false)

  useEffect(() => {
loadContacts()
}, [])
  async function createUser() {
    if (!email.trim()) {
      alert('Email required')
      return
    }
    if (
  role === 'Viewer' &&
  !contactId
) {
  alert(
    'Please select a company for Viewer users'
  )

  return
}


    try {
      setSaving(true)

      const res = await fetch(
        '/api/admin/users/create',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
body: JSON.stringify({
  email,
  role,
  contact_id: contactId && contactId !== ALL_CLIENTS ? contactId : null,
  all_clients: role === 'Viewer' && contactId === ALL_CLIENTS,
}),
        }
      )

      const json = await res.json()

      if (!res.ok) {
        alert(json.error)
        return
      }

      alert('Invitation sent')

      router.push('/admin/users')
    } finally {
      setSaving(false)
    }
  }

  async function loadContacts() {
  const { data, error } = await supabase
    .from('contacts')
    .select(`
      id,
      company_name,
      first_name,
      last_name
    `)
    .order('company_name')

  if (error) {
    console.error(error)
    return
  }

  setContacts(data ?? [])
}

  return (
    <main
      style={{
        maxWidth: 700,
        margin: '80px auto',
      }}
    >
      <h2>Create user</h2>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />

        <select
          value={role}
          onChange={e => setRole(e.target.value)}
        >
          <option value="Administrator">
            Administrator
          </option>

          <option value="Editor">
            Editor
          </option>

          <option value="Viewer">
            Viewer
          </option>
        </select>
{role === 'Viewer' && (
  <select
    value={contactId}
    onChange={e => setContactId(e.target.value)}
  >
    <option value="">
      -- Select company --
    </option>
    <option value={ALL_CLIENTS}>All clients (including future clients)</option>

    {contacts.map(contact => (
      <option
        key={contact.id}
        value={contact.id}
      >
        {contact.company_name ||
          `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim()}
      </option>
    ))}
  </select>
)}
        <button
          className="edit-button"
          onClick={createUser}
          disabled={saving}
        >
          {saving ? 'Creating...' : 'Create User'}
        </button>
      </div>
    </main>
  )
}