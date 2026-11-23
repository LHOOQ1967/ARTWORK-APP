'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseBrowser'

const ALL_CLIENTS = '__all_clients__'

export default function UserDetailPage() {
  const params = useParams()
  const router = useRouter()

  const userId = params.id as string

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

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
      { data: profile, error: profileError },
      { data: access, error: accessError },
      { data: contactsData, error: contactsError },
      { data: allClients, error: allClientsError },
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
        .limit(1)
        .maybeSingle(),

      supabase
        .from('contacts')
        .select('id, company_name')
        .order('company_name'),
      supabase
        .from('viewer_all_clients')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle(),
    ])

    if (profileError || accessError || contactsError || allClientsError) {
      console.error('Unable to load user details', profileError || accessError || contactsError || allClientsError)
      setLoadError('Unable to load user details.')
      setLoading(false)
      return
    }
    setUser(profile)

    setRole(profile?.role ?? '')

    setIsActive(profile?.is_active ?? true)

    setContactId(allClients ? ALL_CLIENTS : access?.contact_id ?? '')

    setContacts(contactsData ?? [])

    setLoading(false)
  }

  async function saveUser() {
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        role,
        is_active: isActive,
      })
      .eq('id', userId)

    if (profileError) {
      alert(profileError.message)
      return
    }
    if (role === 'Viewer') {
      const { error } = await supabase.rpc('set_viewer_client_access', {
        p_user_id: userId,
        p_all_clients: contactId === ALL_CLIENTS,
        p_contact_id: contactId && contactId !== ALL_CLIENTS ? contactId : null,
      })
      if (error) {
        alert(`User details were saved, but access could not be updated: ${error.message}`)
        return
      }
    } else {
      const { error } = await supabase.from('contact_users').delete().eq('user_id', userId)
      if (error) {
        alert(error.message)
        return
      }
    }

    alert('User saved')
  }

  if (loading) {
    return <div>Loading...</div>
  }
  if (loadError) {
    return <div role="alert">{loadError}</div>
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
              <option value={ALL_CLIENTS}>All clients (including future clients)</option>

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