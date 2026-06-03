
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
  const [myCommentHtml, setMyCommentHtml] = useState('')
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved'>('idle')

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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
      .order('updated_at', { ascending: false })

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

    const mine = merged.find((c) => c.user_id === user.id)
    const html = mine?.comment || ''
    setMyCommentHtml(html)

    if (editorRef.current) {
      editorRef.current.innerHTML = html
    }
  }

  async function save(html: string) {
    if (!userId) return

    setSavingState('saving')

    const cleaned = isHtmlEffectivelyEmpty(html) ? '' : html

    const { error } = await supabase
      .from('artwork_viewer_comments')
      .upsert(
        {
          artwork_id: artworkId,
          user_id: userId,
          comment: cleaned,
        },
        {
          onConflict: 'artwork_id,user_id',
        }
      )

    if (error) {
      console.error('Erreur sauvegarde commentaire:', error)
      setSavingState('idle')
      return
    }

    setSavingState('saved')
    setTimeout(() => setSavingState('idle'), 2000)

    load()
  }

  function debounceSave(html: string) {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(() => {
      save(html)
    }, 800)
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  const others = useMemo(() => {
    return comments.filter(
      (c) =>
        c.user_id !== userId &&
        !!c.comment &&
        !isHtmlEffectivelyEmpty(c.comment)
    )
  }, [comments, userId])

  return (
    <div style={{ marginTop: 20 }}>
      {/* MY COMMENT */}
      <div style={sectionRowStyle} className="print-comments">
        <div style={sectionLabelStyle}>My Comment</div>

        <div className="no-print">
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={(e) => {
              const html = (e.target as HTMLDivElement).innerHTML
              setMyCommentHtml(html)
              debounceSave(html)
            }}
            style={editorStyle}
          />
          <div style={savingInlineStyle}>
            {savingState === 'saving' && 'Saving...'}
            {savingState === 'saved' && 'Saved'}
          </div>
        </div>

        <div className="print-text">
          <div dangerouslySetInnerHTML={{ __html: myCommentHtml }} />
        </div>
      </div>

      {/* OTHER COMMENTS */}
      {others.length > 0 && (
        <div style={sectionRowStyle}>
          <div style={sectionLabelStyle}>Other Comments</div>

          <div>
            {others.map((c) => (
              <div key={c.id} style={commentRowStyle}>
                <div style={nameStyle}>{c.profile?.email || 'Utilisateur'}</div>

                <div
                  style={commentHtmlStyle}
                  dangerouslySetInnerHTML={{ __html: c.comment }}
                />

                <div style={dateStyle}>{formatDate(c.updated_at)}</div>
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
  gridTemplateColumns: '180px 1fr 110px',
  gap: '12px',
  alignItems: 'start',
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

const dateStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#777',
  textAlign: 'right',
  whiteSpace: 'nowrap',
}

const savingInlineStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#666',
  marginTop: '6px',
}
