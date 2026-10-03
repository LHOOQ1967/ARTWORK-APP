
'use client'

import { useEffect, useRef, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function formatDate(value: string) {
  return new Intl.DateTimeFormat('fr-CH', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function isHtmlEffectivelyEmpty(html: string) {
  const text = html
    .replace(/<div><br><\/div>/gi, '')
    .replace(/<br>/gi, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .trim()

  return text.length === 0
}

type ViewerComment = {
  id: string
  artwork_id: string
  user_id: string
  comment: string
  created_at: string
  updated_at: string
  profile?: {
    id: string
    email: string
  } | null
}

export default function ArtworkViewerComments({
  artworkId,
}: {
  artworkId: string
}) {
  const [comments, setComments] = useState<ViewerComment[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [draftHtml, setDraftHtml] = useState('')
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const editorRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    load()
  }, [artworkId])

  async function load() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return

    setUserId(user.id)

    const { data: commentsData, error: commentsError } = await supabase
      .from('artwork_viewer_comments')
      .select('*')
      .eq('artwork_id', artworkId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })

    if (commentsError) {
      console.error('Erreur chargement commentaires:', commentsError)
      return
    }

    const userIds = [...new Set((commentsData ?? []).map((c: any) => c.user_id))]

    let profiles: { id: string; email: string }[] = []

    if (userIds.length > 0) {
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email')
        .in('id', userIds)

      if (profilesError) {
        console.error('Erreur chargement profils:', profilesError)
      } else {
        profiles = profilesData ?? []
      }
    }

    const merged: ViewerComment[] = (commentsData ?? []).map((c: any) => ({
      ...c,
      profile: profiles.find((p) => p.id === c.user_id) ?? null,
    }))

    setComments(merged)
  }

  async function saveComment() {
    if (!userId || savingState === 'saving') return

    const cleaned = isHtmlEffectivelyEmpty(draftHtml) ? '' : draftHtml
    if (!cleaned) {
      setErrorMessage('Le commentaire ne peut pas être vide.')
      return
    }

    setSavingState('saving')
    setErrorMessage(null)

    const result = editingCommentId
      ? await supabase
          .from('artwork_viewer_comments')
          .update({ comment: cleaned, updated_by: userId })
          .eq('id', editingCommentId)
          .eq('user_id', userId)
      : await supabase.from('artwork_viewer_comments').insert({
          artwork_id: artworkId,
          user_id: userId,
          comment: cleaned,
        })

    if (result.error) {
      console.error('Erreur sauvegarde commentaire:', {
        code: result.error.code,
        message: result.error.message,
        details: result.error.details,
        hint: result.error.hint,
      })
      setErrorMessage(
        result.error.code === '23505'
          ? 'La base limite encore les commentaires à un par utilisateur et par œuvre. Appliquez la migration Supabase des commentaires multiples.'
          : 'Impossible d’enregistrer le commentaire.'
      )
      setSavingState('idle')
      return
    }

    setDraftHtml('')
    setEditingCommentId(null)
    if (editorRef.current) editorRef.current.innerHTML = ''
    setSavingState('saved')
    setTimeout(() => setSavingState('idle'), 2000)

    await load()
  }

  function startEditing(comment: ViewerComment) {
    setEditingCommentId(comment.id)
    setDraftHtml(comment.comment)
    setErrorMessage(null)
    if (editorRef.current) {
      editorRef.current.innerHTML = comment.comment
      editorRef.current.focus()
    }
  }

  function cancelEditing() {
    setEditingCommentId(null)
    setDraftHtml('')
    setErrorMessage(null)
    if (editorRef.current) editorRef.current.innerHTML = ''
  }

  async function deleteComment(commentId: string) {
    if (!userId || !window.confirm('Supprimer ce commentaire ?')) return

    const { error } = await supabase
      .from('artwork_viewer_comments')
      .delete()
      .eq('id', commentId)
      .eq('user_id', userId)

    if (error) {
      console.error('Erreur suppression commentaire:', error)
      setErrorMessage('Impossible de supprimer le commentaire.')
      return
    }

    if (editingCommentId === commentId) cancelEditing()
    await load()
  }

  const visibleComments = comments.filter(
    (comment) => !!comment.comment && !isHtmlEffectivelyEmpty(comment.comment)
  )

  return (
    <div style={{ marginTop: 20 }}>
      <div style={sectionRowStyle} className="no-print">
        <div style={sectionLabelStyle}>My Comment</div>

        <div>
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={(e) => {
              setDraftHtml((e.target as HTMLDivElement).innerHTML)
              setErrorMessage(null)
            }}
            style={editorStyle}
          />
          {errorMessage ? <div style={errorStyle}>{errorMessage}</div> : null}
          <div style={formActionsStyle}>
            <button
              type="button"
              className="edit-button"
              onClick={saveComment}
              disabled={savingState === 'saving' || isHtmlEffectivelyEmpty(draftHtml)}
            >
              {savingState === 'saving' ? 'Saving...' : 'Save Comment'}
            </button>
            {editingCommentId ? (
              <button type="button" className="edit-button" onClick={cancelEditing}>
                Cancel
              </button>
            ) : null}
            {savingState === 'saved' ? <span style={savingInlineStyle}>Saved</span> : null}
          </div>
        </div>
      </div>

      {visibleComments.length > 0 && (
        <div style={sectionRowStyle} className="print-comments">
          <div style={sectionLabelStyle}>Comment History</div>

          <div>
            {visibleComments.map((c) => (
              <div key={c.id} style={commentRowStyle}>
                <div style={nameStyle}>
                  {c.user_id === userId ? 'You' : c.profile?.email || 'Utilisateur'}
                </div>

                <div style={commentBodyStyle}>
                  <div
                    style={commentHtmlStyle}
                    dangerouslySetInnerHTML={{ __html: c.comment }}
                  />
                </div>

                <div style={dateStyle}>{formatDate(c.created_at)}</div>

                {c.user_id === userId ? (
                  <div className="no-print" style={commentActionsStyle}>
                    <button
                      type="button"
                      aria-label="Modifier le commentaire"
                      title="Modifier le commentaire"
                      style={commentActionButtonStyle}
                      onClick={() => startEditing(c)}
                    >
                      <svg
                        aria-hidden="true"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      aria-label="Supprimer le commentaire"
                      title="Supprimer le commentaire"
                      style={commentActionButtonStyle}
                      onClick={() => deleteComment(c.id)}
                    >
                      <svg
                        aria-hidden="true"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 6h18" />
                        <path d="M8 6V4h8v2" />
                        <path d="m19 6-1 14H6L5 6" />
                        <path d="M10 11v6M14 11v6" />
                      </svg>
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const sectionRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '150px 1fr',
  gap: '12px',
  alignItems: 'start',
  marginBottom: '18px',
}

const sectionLabelStyle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: '16px',
  lineHeight: '34px',
}

const editorStyle: React.CSSProperties = {
  minHeight: '38px',
  padding: '8px 10px',
  border: '1px solid #ccc',
  borderRadius: '4px',
  fontSize: '14px',
  lineHeight: 1.4,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'break-word',
  outline: 'none',
}

const commentRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '180px minmax(0, 1fr) 110px 56px',
  gap: '12px',
  alignItems: 'center',
  padding: '8px 0',
  borderBottom: '1px solid #eee',
}

const nameStyle: React.CSSProperties = {
  fontWeight: 500,
  fontSize: '14px',
}

const commentHtmlStyle: React.CSSProperties = {
  fontSize: '14px',
  lineHeight: 1.4,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'break-word',
}

const commentBodyStyle: React.CSSProperties = {
  minWidth: 0,
}

const commentActionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  justifyContent: 'flex-end',
  alignItems: 'start',
}

const commentActionButtonStyle: React.CSSProperties = {
  width: '24px',
  height: '24px',
  minWidth: '24px',
  padding: '4px',
  border: '1px solid #d8ddda',
  borderRadius: '3px',
  background: '#f1f3f2',
  color: '#68716c',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
}

const formActionsStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginTop: '8px',
}

const dateStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#777',
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
}

const savingInlineStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#666',
  marginTop: '6px',
}

const errorStyle: React.CSSProperties = {
  color: '#b91c1c',
  fontSize: '12px',
  marginTop: '6px',
}
