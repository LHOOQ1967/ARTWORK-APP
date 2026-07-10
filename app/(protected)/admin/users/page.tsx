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

function formatLastActivity(value: string | null) {
  if (!value) return 'Never'

  const date = new Date(value)

  const diffDays = Math.floor(
    (Date.now() - date.getTime()) / 86400000
  )

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 30) return `${diffDays} days ago`

  return date.toLocaleDateString('fr-CH')
}


export default function UsersPage() {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [accesses, setAccesses] = useState<any[]>([])
const [contacts, setContacts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
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
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('*')
      .order('email'),

    supabase
      .from('contact_users')
      .select('user_id, contact_id, invited'),

    supabase
      .from('contacts')
      .select(`
        id,
        company_name,
        first_name,
        last_name
      `),
  ])

  if (profilesError) {
    console.error(profilesError)
    setLoading(false)
    return
  }

  if (accessError) {
    console.error(accessError)
  }

  if (contactsError) {
    console.error(contactsError)
  }

  setUsers((profiles ?? []) as UserProfile[])
  setAccesses(contactUsers ?? [])
  setContacts(contactsData ?? [])

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

    setUsers(prev =>
      prev.map(u =>
        u.id === userId
          ? { ...u, role }
          : u
      )
    )
  }

async function updateUserAccess(
  userId: string,
  contactId: string
) {
  try {
    // supprimer ancien accès
    await supabase
      .from('contact_users')
      .delete()
      .eq('user_id', userId)

    // créer nouveau accès
    if (contactId) {
      const { error } = await supabase
        .from('contact_users')
        .insert({
          user_id: userId,
          contact_id: contactId,
        })

      if (error) {
        console.error(error)
        alert(error.message)
        return
      }
    }

    await loadUsers()
  } catch (error) {
    console.error(error)
  }
}



function getUserContactId(userId: string) {
  const access = accesses.find(
    a => a.user_id === userId
  )

  return access?.contact_id ?? ''
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
  return (
    <main
      style={{
        paddingTop: 90,
        paddingLeft: 20,
        paddingRight: 20,
        paddingBottom: 40,
        backgroundColor: '#006039',
        minHeight: '100vh',
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 20,
          }}
        >
          <h2
            style={{
              color: 'white',
              margin: 0,
            }}
          >
            Users ({users.length})
          </h2>

          <Link href="/admin/users/new">
            <button className="edit-button">
              + New User
            </button>
          </Link>
        </div>

        <div
          style={{
            backgroundColor: 'white',
            borderRadius: 8,
            overflow: 'hidden',
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
<th style={th}>Email</th>
<th style={th}>Role</th>
<th style={th}>Access</th>
<th style={th}>Status</th>
<th style={th}>Created</th>
<th style={th}>Last Activity</th>
<th style={th}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {users.map(user => (
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

      {contacts.map(contact => (
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
                    {user.is_active
                      ? 'Active'
                      : 'Disabled'}
                  </td>

                  <td style={td}>
                    {user.created_at
                      ? new Date(
                          user.created_at
                        ).toLocaleDateString()
                      : ''}
                  </td>
<td style={td}>
  {formatLastActivity(
    user.last_activity_at
  )}
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
  padding: 12,
  backgroundColor: '#f5f5f5',
  borderBottom: '1px solid #ddd',
}

const td: React.CSSProperties = {
  padding: 12,
  borderBottom: '1px solid #eee',
}