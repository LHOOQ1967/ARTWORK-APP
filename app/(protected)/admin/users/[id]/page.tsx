'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseBrowser'

export default function UserDetailPage() {
  const params = useParams()
  const router = useRouter()

  const userId = params.id as string

  const [loading, setLoading] = useState(true)

  const [user, setUser] = useState<any>(null)

  const [contacts, setContacts] = useState<any[]>([])

  const [role, setRole] = useState('')
  const [contactId, setContactId] = useState('')
  const [isActive, setIsActive] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)

    const [
      { data: profile },
      { data: access },
      { data: contactsData },
    ] = await Promise.all([
      supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single(),

      supabase
        .from('contact_users')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle(),

      supabase
        .from('contacts')
        .select('id, company_name')
        .order('company_name'),
    ])

    setUser(profile)

    setRole(profile?.role ?? '')

    setIsActive(profile?.is_active ?? true)

    setContactId(access?.contact_id ?? '')

    setContacts(contactsData ?? [])

    setLoading(false)
  }

  async function saveUser() {
    await supabase
      .from('profiles')
      .update({
        role,
        is_active: isActive,
      })
      .eq('id', userId)

    await supabase
      .from('contact_users')
      .delete()
      .eq('user_id', userId)

    if (
      role === 'Viewer' &&
      contactId
    ) {
      await supabase
        .from('contact_users')
        .insert({
          user_id: userId,
          contact_id: contactId,
        })
    }

    alert('User saved')
  }

  if (loading) {
    return <div>Loading...</div>
  }

  return (
    <main
      style={{
        maxWidth: 700,
        margin: '80px auto',
      }}
    >
      <h2>User Detail</h2>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div>
          <strong>Email</strong>
          <div>{user?.email}</div>
        </div>

        <div>
          <strong>Role</strong>

          <select
            value={role}
            onChange={(e) =>
              setRole(e.target.value)
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
        </div>

        {role === 'Viewer' && (
          <div>
            <strong>Access</strong>

            <select
              value={contactId}
              onChange={(e) =>
                setContactId(e.target.value)
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
          </div>
        )}

        <div>
          <strong>Status</strong>

          <select
            value={String(isActive)}
            onChange={(e) =>
              setIsActive(
                e.target.value === 'true'
              )
            }
          >
            <option value="true">
              Active
            </option>

            <option value="false">
              Disabled
            </option>
          </select>
        </div>

        <div>
          <strong>Created</strong>

          <div>
            {user?.created_at
              ? new Date(
                  user.created_at
                ).toLocaleDateString('fr-FR')
              : ''}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 12,
            marginTop: 20,
          }}
        >
          <button
            className="edit-button"
            onClick={saveUser}
          >
            Save
          </button>

          <button
            className="edit-button"
            onClick={() =>
              router.push(
                '/admin/users'
              )
            }
          >
            Back
          </button>
        </div>
      </div>
    </main>
  )
}