'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseBrowser'
import { useSessionProfile } from '@/contexts/SessionContext'
import { useRouter } from 'next/navigation'


type UserProfile = {
  id: string
  email: string | null
  role: string | null
  is_active: boolean | null
  created_at: string | null
  last_activity_at: string | null
}

type UserSortKey = 'email' | 'role' | 'access' | 'status' | 'created' | 'activity'
const ALL_CLIENTS = '__all_clients__'

async function loadContactUsers() {
  const rows: { user_id: string; contact_id: string; invited: boolean }[] = []
  for (let offset = 0; ; offset += 200) {
    const { data, error } = await supabase.from('contact_users')
      .select('user_id, contact_id, invited')
      .order('user_id').order('contact_id')
      .range(offset, offset + 199)
    if (error) return { data: null, error }
    rows.push(...(data ?? []))
    if (!data || data.length < 200) return { data: rows, error: null }
  }
}

function formatLastActivity(value: string | null) {
  if (!value) return { date: 'Never', time: '' }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { date: '—', time: '' }

  return {
    date: date.toLocaleDateString('fr-CH'),
    time: date.toLocaleTimeString('fr-CH', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Zurich',
    }),
  }
}


export default function UsersPage() {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [accesses, setAccesses] = useState<any[]>([])
  const [allClientUsers, setAllClientUsers] = useState<string[]>([])
const [contacts, setContacts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<UserSortKey>('email')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
const router = useRouter()
  const { role } = useSessionProfile()

  useEffect(() => {
    loadUsers()
  }, [])

async function loadUsers() {
  setLoading(true)

  const [
    { data: profiles, error: profilesError },
    { data: contactUsers, error: accessError },
    { data: contactsData, error: contactsError },
    { data: allClients, error: allClientsError },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('*')
      .order('email'),

    loadContactUsers(),

    supabase
      .from('contacts')
      .select(`
        id,
        company_name,
        first_name,
        last_name
      `),
    supabase.from('viewer_all_clients').select('user_id'),
  ])

  if (profilesError) {
    console.error(profilesError)
    setLoading(false)
    return
  }

  if (accessError) {
    console.error(accessError)
    alert('Unable to load user access.')
    setLoading(false)
    return
  }

  if (contactsError) {
    console.error(contactsError)
  }
  if (allClientsError) {
    console.error(allClientsError)
    alert('Unable to load all-client access.')
    setLoading(false)
    return
  }

  setUsers((profiles ?? []) as UserProfile[])
  setAccesses(contactUsers ?? [])
  setContacts(contactsData ?? [])
  setAllClientUsers((allClients ?? []).map(row => row.user_id))

  setLoading(false)
}

  async function updateRole(
    userId: string,
    role: string
  ) {
    const { error } = await supabase
      .from('profiles')
      .update({
        role,
      })
      .eq('id', userId)

    if (error) {
      alert(error.message)
      return
    }

    await loadUsers()
  }

async function updateUserAccess(
  userId: string,
  contactId: string
) {
  const { error } = await supabase.rpc('set_viewer_client_access', {
    p_user_id: userId,
    p_all_clients: contactId === ALL_CLIENTS,
    p_contact_id: contactId && contactId !== ALL_CLIENTS ? contactId : null,
  })
  if (error) {
    console.error(error)
    alert(error.message)
    return
  }
  await loadUsers()
}



function getUserContactId(userId: string) {
  if (allClientUsers.includes(userId)) return ALL_CLIENTS
  const access = accesses.find(
    a => a.user_id === userId
  )

  return access?.contact_id ?? ''
}

function handleSort(key: UserSortKey) {
  if (sortKey === key) {
    setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    return
  }

  setSortKey(key)
  setSortDirection(key === 'created' || key === 'activity' ? 'desc' : 'asc')
}

function sortIndicator(key: UserSortKey) {
  if (sortKey !== key) return ' ↕'
  return sortDirection === 'asc' ? ' ↑' : ' ↓'
}
function hasAccess(
  userId: string,
  contactId: string
) {
  return accesses.some(
    a =>
      a.user_id === userId &&
      a.contact_id === contactId
  )
}
  async function toggleActive(
    userId: string,
    currentValue: boolean
  ) {
    const { error } = await supabase
      .from('profiles')
      .update({
        is_active: !currentValue,
      })
      .eq('id', userId)

    if (error) {
      alert(error.message)
      return
    }

    setUsers(prev =>
      prev.map(u =>
        u.id === userId
          ? {
              ...u,
              is_active: !currentValue,
            }
          : u
      )
    )
  }

if (
  role &&
  role.toLowerCase() !== 'administrator'
) {
  return (
    <main
      style={{
        paddingTop: 100,
        textAlign: 'center',
        color: 'white',
      }}
    >
      <h2>Access denied</h2>
      <p>This page is reserved for administrators.</p>
    </main>
  )
}


  if (loading) {
    return (
      <main style={{ padding: 40 }}>
        Loading users...
      </main>
    )
  }

  function getAccessText(
  userId: string,
  role: string | null,
  accesses: any[],
  contacts: any[]
) {
  if (
    role === 'Administrator' ||
    role === 'Editor'
  ) {
    return 'All'
  }
  if (allClientUsers.includes(userId)) return 'All clients'

  const contactIds = accesses
    .filter(a => a.user_id === userId)
    .map(a => a.contact_id)

  const names = contacts
    .filter(c => contactIds.includes(c.id))
    .map(c => {
      if (c.company_name) {
        return c.company_name
      }

      return `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim()
    })

  return names.join(', ')
}

  const sortedUsers = [...users].sort((a, b) => {
    const accessA = getAccessText(a.id, a.role, accesses, contacts)
    const accessB = getAccessText(b.id, b.role, accesses, contacts)
    const values: Record<UserSortKey, [string | number, string | number]> = {
      email: [a.email ?? '', b.email ?? ''],
      role: [a.role ?? '', b.role ?? ''],
      access: [accessA, accessB],
      status: [a.is_active ? 1 : 0, b.is_active ? 1 : 0],
      created: [a.created_at ? new Date(a.created_at).getTime() : 0, b.created_at ? new Date(b.created_at).getTime() : 0],
      activity: [a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0, b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0],
    }
    const [valueA, valueB] = values[sortKey]
    const result = typeof valueA === 'number' && typeof valueB === 'number'
      ? valueA - valueB
      : String(valueA).localeCompare(String(valueB), 'fr', { sensitivity: 'base' })

    return sortDirection === 'asc' ? result : -result
  })

  return (
    <main
      style={{
        paddingTop: 90,
        paddingLeft: 20,
        paddingRight: 20,
        paddingBottom: 40,
        backgroundColor: '#f3f5f1',
        minHeight: '100vh',
      }}
    >
      <div
        style={{
          maxWidth: 1380,
          margin: '0 auto',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            marginBottom: 28,
          }}
        >
          <div>
            <div className="users-page-eyebrow">Administration</div>
            <h1 className="users-page-title">Users</h1>
            <p className="users-page-subtitle">Manage roles, access and account status.</p>
          </div>

          <Link href="/admin/users/new">
            <button className="users-page-primary-button">
              + New User
            </button>
          </Link>
        </div>

        <div
          style={{
            backgroundColor: 'white',
            borderRadius: 12,
            overflowX: 'auto',
            boxShadow: '0 12px 30px rgba(31,56,46,0.07)',
            border: '1px solid #d7dfda',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
            }}
          >
            <thead>
              <tr>
<th style={th}><button className="users-sort-button" onClick={() => handleSort('email')}>Email{sortIndicator('email')}</button></th>
<th style={th}><button className="users-sort-button" onClick={() => handleSort('role')}>Role{sortIndicator('role')}</button></th>
<th style={th}><button className="users-sort-button" onClick={() => handleSort('access')}>Access{sortIndicator('access')}</button></th>
<th style={th}><button className="users-sort-button" onClick={() => handleSort('status')}>Status{sortIndicator('status')}</button></th>
<th style={th}><button className="users-sort-button" onClick={() => handleSort('created')}>Created{sortIndicator('created')}</button></th>
<th style={th}><button className="users-sort-button" onClick={() => handleSort('activity')}>Last Activity{sortIndicator('activity')}</button></th>
<th style={th}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {sortedUsers.map(user => (
                <tr key={user.id}>
                  <td style={td}>
                    {user.email}
                  </td>

                  <td style={td}>
                    <select
                      value={user.role ?? ''}
                      onChange={(e) =>
                        updateRole(
                          user.id,
                          e.target.value
                        )
                      }
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
                  </td>
<td style={td}>
  {user.role === 'Administrator' ||
   user.role === 'Editor' ? (
    <strong>All</strong>
  ) : (
    <select
      value={getUserContactId(user.id)}
      onChange={(e) =>
        updateUserAccess(
          user.id,
          e.target.value
        )
      }
    >
      <option value="">
        -- Select company --
      </option>
      <option value={ALL_CLIENTS}>All clients (including future clients)</option>

      {[...contacts]
        .sort((a, b) =>
          (a.company_name ?? '').localeCompare(
            b.company_name ?? '',
            'fr',
            { sensitivity: 'base' }
          )
        )
        .map(contact => (
        <option
          key={contact.id}
          value={contact.id}
        >
          {contact.company_name}
        </option>
      ))}
    </select>
  )}
</td>
                  <td style={td}>
                    <span className={user.is_active ? 'users-status-active' : 'users-status-disabled'}>
                      {user.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </td>

                  <td style={td}>
                    {user.created_at
                      ? new Date(
                          user.created_at
                        ).toLocaleDateString()
                      : ''}
                  </td>
<td style={td}>
  {(() => {
    const activity = formatLastActivity(user.last_activity_at)
    return (
      <div className="users-last-activity">
        <span>{activity.date}</span>
        {activity.time && <small>{activity.time}</small>}
      </div>
    )
  })()}
</td>

<td style={td}>
  <div
    style={{
      display: 'flex',
      gap: 8,
    }}
  >
    <button
      className="edit-button"
      onClick={() =>
        toggleActive(
          user.id,
          !!user.is_active
        )
      }
    >
      {user.is_active
        ? 'Disable'
        : 'Enable'}
    </button>
  </div>
</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '14px 16px',
  backgroundColor: '#f8faf8',
  color: '#52645c',
  fontSize: '0.78rem',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  borderBottom: '1px solid #e1e7e3',
}

const td: React.CSSProperties = {
  padding: '14px 16px',
  borderBottom: '1px solid #edf0ee',
}