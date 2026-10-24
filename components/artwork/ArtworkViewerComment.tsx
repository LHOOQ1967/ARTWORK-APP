'use client'

import { useEffect, useEffectEvent, useRef, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabaseBrowser'
import { useSessionProfile } from '@/contexts/SessionContext'

type ClientOption = { id: string; label: string }
type ViewerComment = {
  id: string
  artwork_id: string
  user_id: string
  recipient_contact_id: string | null
  comment: string
  created_at: string
  updated_at: string
  recipient: { company_name: string | null; first_name: string | null; last_name: string | null } | null
  authorEmail?: string
}

function recipientLabel(comment: ViewerComment) {
  if (!comment.recipient_contact_id) return 'Internal (Editors / Administrators only)'
  return comment.recipient?.company_name ||
    [comment.recipient?.first_name, comment.recipient?.last_name].filter(Boolean).join(' ') || 'Client'
}

function isHtmlEffectivelyEmpty(html: string) {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim().length === 0
}

export default function ArtworkViewerComments({ artworkId }: { artworkId: string }) {
  const { role, user } = useSessionProfile()
  const userId = user?.id
  const canManage = role === 'Editor' || role === 'Administrator'
  const [comments, setComments] = useState<ViewerComment[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [recipientId, setRecipientId] = useState('')
  const [draftHtml, setDraftHtml] = useState('')
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [loadedScope, setLoadedScope] = useState('')
  const [reload, setReload] = useState(0)
  const editorRef = useRef<HTMLDivElement>(null)
  const scope = `${artworkId}:${userId}:${role}`
  const scopeRef = useRef(scope)
  useEffect(() => { scopeRef.current = scope }, [scope])

  useEffect(() => {
    if (!userId || !role) return
    let active = true
    void (async () => {
      setLoading(true)
      setLoadError('')
      try {
        const { data: clientData, error: clientError } = await supabase
          .rpc('artwork_comment_clients', { p_artwork_id: artworkId })
        if (clientError) throw clientError
        const rawClients: unknown = clientData
        if (!Array.isArray(rawClients)) throw new Error('Invalid comment clients response')
        const options: ClientOption[] = rawClients.map((client: unknown) => {
          if (!client || typeof client !== 'object' || !('id' in client) || typeof client.id !== 'string' ||
            !('label' in client) || typeof client.label !== 'string') throw new Error('Invalid comment client')
          return { id: client.id, label: client.label }
        })
        const history: ViewerComment[] = []
        for (let offset = 0; active; offset += 200) {
          const { data, error } = await supabase.from('artwork_viewer_comments')
            .select(`id, artwork_id, user_id, recipient_contact_id, comment, created_at, updated_at,
              recipient:contacts!artwork_viewer_comments_recipient_contact_id_fkey(company_name, first_name, last_name)`)
            .eq('artwork_id', artworkId).order('created_at').order('id').range(offset, offset + 199)
            .returns<ViewerComment[]>()
          if (error) throw error
          history.push(...(data ?? []))
          if (!data || data.length < 200) break
        }
        const authorIds = [...new Set(history.map(comment => comment.user_id))]
        const authors = new Map<string, string>()
        for (let offset = 0; active && offset < authorIds.length; offset += 200) {
          const { data, error } = await supabase.from('profiles').select('id, email')
            .in('id', authorIds.slice(offset, offset + 200))
          if (error) throw error
          for (const profile of data ?? []) authors.set(profile.id, profile.email)
        }
        if (!active) return
        setClients(options)
        setComments(history.map(comment => ({ ...comment, authorEmail: authors.get(comment.user_id) })))
        setLoadedScope(scope)
      } catch (cause) {
        console.error('LOAD CLIENT COMMENTS FAILED:', cause)
        if (active) setLoadError('Unable to load client comments. Retry to continue.')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [artworkId, userId, role, scope, reload])

  useEffect(() => {
    setDraftHtml('')
    setEditingCommentId(null)
    setRecipientId('')
    setErrorMessage('')
    setSaved(false)
    setSaving(false)
    if (editorRef.current) editorRef.current.innerHTML = ''
  }, [scope])

  const ready = loadedScope === scope && !loading && !loadError
  const targetId = !canManage && !recipientId && clients.length === 1 ? clients[0].id : recipientId
  const restoreDraft = useEffectEvent(() => {
    if (editorRef.current) editorRef.current.innerHTML = draftHtml
  })
  useEffect(() => {
    if (ready) restoreDraft()
  }, [ready])

  function cancelEditing() {
    setEditingCommentId(null)
    setDraftHtml('')
    setRecipientId('')
    setErrorMessage('')
    if (editorRef.current) editorRef.current.innerHTML = ''
  }

  async function saveComment() {
    if (!userId || !ready || saving) return
    if (isHtmlEffectivelyEmpty(draftHtml)) {
      setErrorMessage('The comment cannot be empty.')
      return
    }
    if ((!canManage && !targetId) || (targetId && !clients.some(client => client.id === targetId))) {
      setErrorMessage('Select a client for this comment.')
      return
    }
    setSaving(true)
    setSaved(false)
    setErrorMessage('')
    try {
      const payload = { comment: draftHtml, recipient_contact_id: targetId || null }
      const result = editingCommentId
        ? await supabase.from('artwork_viewer_comments').update({ ...payload, updated_by: userId })
          .eq('id', editingCommentId).eq('user_id', userId).select('id').single()
        : await supabase.from('artwork_viewer_comments').insert({ ...payload, artwork_id: artworkId, user_id: userId })
          .select('id').single()
      if (result.error) throw result.error
      if (!result.data) throw new Error('Comment save was not confirmed')
      if (scopeRef.current !== scope) return
      cancelEditing()
      setSaved(true)
      setReload(value => value + 1)
    } catch (cause) {
      console.error('SAVE CLIENT COMMENT FAILED:', cause)
      if (scopeRef.current === scope) setErrorMessage('Unable to save the comment.')
    } finally {
      if (scopeRef.current === scope) setSaving(false)
    }
  }

  async function assignClient(comment: ViewerComment, recipient: string) {
    if (!canManage || saving || !ready) return
    setSaving(true)
    setErrorMessage('')
    try {
      const { data, error } = await supabase.from('artwork_viewer_comments')
        .update({ recipient_contact_id: recipient || null, updated_by: userId })
        .eq('id', comment.id).select('id').single()
      if (error) throw error
      if (!data) throw new Error('Comment assignment was not confirmed')
      if (scopeRef.current === scope) setReload(value => value + 1)
    } catch (cause) {
      console.error('ASSIGN COMMENT CLIENT FAILED:', cause)
      if (scopeRef.current === scope) setErrorMessage('Unable to change the comment recipient.')
    } finally {
      if (scopeRef.current === scope) setSaving(false)
    }
  }

  async function deleteComment(commentId: string) {
    if (!userId || saving || !ready || !window.confirm('Delete this comment?')) return
    setSaving(true)
    setErrorMessage('')
    try {
      const { data, error } = await supabase.from('artwork_viewer_comments').delete()
        .eq('id', commentId).eq('user_id', userId).select('id').single()
      if (error) throw error
      if (!data) throw new Error('Comment deletion was not confirmed')
      if (scopeRef.current !== scope) return
      if (editingCommentId === commentId) cancelEditing()
      setReload(value => value + 1)
    } catch (cause) {
      console.error('DELETE CLIENT COMMENT FAILED:', cause)
      if (scopeRef.current === scope) setErrorMessage('Unable to delete the comment.')
    } finally {
      if (scopeRef.current === scope) setSaving(false)
    }
  }

  if (!userId || !role) return null
  return <div style={{ marginTop: 20 }}>
    {loadError ? <div role="alert">{loadError} <button type="button" onClick={() => setReload(value => value + 1)}>Retry</button></div>
      : !ready ? <p role="status">Loading client comments...</p> : <>
        <div style={sectionRowStyle} className="no-print">
          <div style={sectionLabelStyle}>{editingCommentId ? 'Edit comment' : 'New comment'}</div>
          <div>
            <label>Client
              <select aria-label="Comment client" value={targetId} disabled={saving}
                onChange={event => { setRecipientId(event.target.value); setSaved(false) }} style={{ margin: '0 0 8px 8px', maxWidth: '100%' }}>
                <option value="">{canManage ? 'Internal (Editors / Administrators only)' : 'Select client'}</option>
                {clients.map(client => <option key={client.id} value={client.id}>{client.label}</option>)}
              </select>
            </label>
            <div ref={editorRef} contentEditable={!saving} role="textbox" aria-label="Comment"
              aria-multiline="true" suppressContentEditableWarning
              onInput={event => { setDraftHtml(event.currentTarget.innerHTML); setErrorMessage(''); setSaved(false) }}
              style={editorStyle} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button" className="edit-button" onClick={() => void saveComment()}
                disabled={saving || isHtmlEffectivelyEmpty(draftHtml) || (!canManage && !targetId)}>
                {saving ? 'Saving...' : 'Save Comment'}
              </button>
              {editingCommentId && <button type="button" disabled={saving} onClick={cancelEditing}>Cancel</button>}
              {saved && <span role="status">Saved</span>}
            </div>
          </div>
        </div>
        {comments.some(comment => !isHtmlEffectivelyEmpty(comment.comment)) && (
          <div style={sectionRowStyle} className="print-comments">
            <div style={sectionLabelStyle}>Comment History</div>
            <div>{comments.filter(comment => !isHtmlEffectivelyEmpty(comment.comment)).map(comment => (
              <div key={comment.id} style={{ padding: '8px 0', borderBottom: '1px solid #eee' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12 }}>
                  <strong>{comment.user_id === userId ? 'You' : comment.authorEmail || 'User'}</strong>
                  <span>Client: {recipientLabel(comment)}</span>
                  <time dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleString('en-GB')}</time>
                </div>
                <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'break-word', marginTop: 6 }}
                  dangerouslySetInnerHTML={{ __html: comment.comment }} />
                <div className="no-print" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                  {canManage && <select aria-label={`Client for comment ${comment.id}`} disabled={saving}
                    value={comment.recipient_contact_id ?? ''} onChange={event => void assignClient(comment, event.target.value)}>
                    <option value="">Internal (Editors / Administrators only)</option>
                    {comment.recipient_contact_id && !clients.some(client => client.id === comment.recipient_contact_id) &&
                      <option value={comment.recipient_contact_id}>{recipientLabel(comment)} (previous client)</option>}
                    {clients.map(client => <option key={client.id} value={client.id}>{client.label}</option>)}
                  </select>}
                  {comment.user_id === userId && <>
                    <button type="button" aria-label="Edit comment" disabled={saving} onClick={() => {
                      setEditingCommentId(comment.id)
                      setRecipientId(comment.recipient_contact_id ?? '')
                      setDraftHtml(comment.comment)
                      setErrorMessage('')
                      if (editorRef.current) { editorRef.current.innerHTML = comment.comment; editorRef.current.focus() }
                    }}>Edit</button>
                    <button type="button" aria-label="Delete comment" disabled={saving} onClick={() => void deleteComment(comment.id)}>Delete</button>
                  </>}
                </div>
              </div>
            ))}</div>
          </div>
        )}
      </>}
    {errorMessage && <p role="alert" style={{ color: '#b91c1c' }}>{errorMessage}</p>}
  </div>
}

const sectionRowStyle: CSSProperties = {
  display: 'grid', gridTemplateColumns: '150px minmax(0, 1fr)', gap: 12, alignItems: 'start', marginBottom: 18,
}
const sectionLabelStyle: CSSProperties = { fontWeight: 700, fontSize: 16, lineHeight: '34px' }
const editorStyle: CSSProperties = {
  minHeight: 38, padding: '8px 10px', border: '1px solid #ccc', borderRadius: 4,
  fontSize: 14, lineHeight: 1.4, whiteSpace: 'pre-wrap', overflowWrap: 'break-word', outline: 'none',
}
