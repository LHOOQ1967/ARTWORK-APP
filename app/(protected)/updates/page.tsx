'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useSessionProfile } from '@/contexts/SessionContext'
import { supabase } from '@/lib/supabaseBrowser'
import { RichTextContent } from '@/components/ui/RichTextContent'
import RichTextEditor from '@/components/ui/RichTextEditor'
import styles from './updates.module.css'

type UpdatesDocument = { content: string; updated_at: string }

export default function UpdatesPage() {
  const { user, role } = useSessionProfile()
  return <UpdatesContent key={`${user?.id}:${role}`} canEdit={role === 'Administrator'} />
}

function UpdatesContent({ canEdit }: { canEdit: boolean }) {
  const [document, setDocument] = useState<UpdatesDocument | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [retry, setRetry] = useState(0)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError('')
      try {
        const { data, error } = await supabase.from('application_updates')
          .select('content, updated_at').eq('id', true).single<UpdatesDocument>()
        if (error) throw new Error(error.message)
        if (!data) throw new Error('The updates page is not available.')
        if (!cancelled) setDocument(data)
      } catch (error) {
        console.error('UPDATES LOAD ERROR:', error)
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Unable to load updates.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [retry])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canEdit || !document || saving) return
    setSaveError('')
    setSaved(false)
    if (!draft.trim()) {
      setSaveError('Enter the updates before saving.')
      return
    }
    setSaving(true)
    try {
      const { data, error } = await supabase.from('application_updates')
        .update({ content: draft.trim() }).eq('id', true).eq('updated_at', document.updated_at)
        .select('content, updated_at').maybeSingle<UpdatesDocument>()
      if (error) throw new Error(error.message)
      if (!data) throw new Error('The updates have changed or you no longer have permission to edit them. Copy your text and reload the page before trying again.')
      setDocument(data)
      setEditing(false)
      setSaved(true)
    } catch (error) {
      console.error('UPDATES SAVE ERROR:', error)
      setSaveError(error instanceof Error ? error.message : 'Unable to save updates.')
    } finally {
      setSaving(false)
    }
  }

  return <main className={styles.page}>
    <header className={styles.header}>
      <div>
        <h1>Updates</h1>
        <p>Latest improvements and changes to ArtMuse.</p>
      </div>
      {canEdit && document && !loading && !loadError && !editing && <button type="button" onClick={() => {
        setDraft(document.content)
        setSaveError('')
        setSaved(false)
        setEditing(true)
      }}>Edit updates</button>}
    </header>
    {loading ? <div className="ux-feedback-card" role="status">Loading updates...</div>
      : loadError ? <div className="ux-feedback-card ux-feedback-card-error" role="alert">
        <span>{loadError}</span>
        <button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button>
      </div>
      : document && <>
        {saved && <p className="ux-inline-success" role="status">Updates saved. All users can now read the latest version.</p>}
        {editing ? <form className={styles.panel} onSubmit={save}>
          <label htmlFor="updates-content">Updates content</label>
          <p>Visible to all signed-in users. Update this page before every production release.</p>
          <RichTextEditor id="updates-content" label="Updates content" value={draft} maxLength={50000}
            minHeight={300} disabled={saving} onChange={setDraft} />
          {saveError && <p role="alert">{saveError}</p>}
          <div className={styles.actions}>
            <button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save updates'}</button>
            <button type="button" disabled={saving} onClick={() => {
              setEditing(false)
              setSaveError('')
            }}>Cancel</button>
          </div>
        </form>
          : document.content.trim() ? <article className={styles.panel}>
            <p className={styles.updated}>Last updated: <time dateTime={document.updated_at}>
              {new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeStyle: 'short' })
                .format(new Date(document.updated_at))}
            </time></p>
            <div className={styles.content}><RichTextContent text={document.content} /></div>
          </article>
            : <div className="ux-empty-state">No updates have been published yet.</div>}
      </>}
  </main>
}
