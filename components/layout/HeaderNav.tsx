
'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabaseBrowser'
import { useSessionProfile } from '@/contexts/SessionContext'

type CommentNotification = {
  kind: 'comment'
  id: string
  artwork_id: string
  user_id: string
  comment: string
  created_at: string
  updated_at: string
  authorEmail: string | null
  artworkLabel: string
}

type AcquisitionNotification = {
  kind: 'acquisition'
  id: string
  artwork_id: string
  actor_id: string | null
  created_at: string
  authorEmail: string | null
  artworkLabel: string
}

type MenuNotification = CommentNotification | AcquisitionNotification

function notificationVersion(notification: MenuNotification) {
  return notification.kind === 'comment'
    ? notification.updated_at
    : notification.created_at
}

function notificationSeenKey(notification: MenuNotification) {
  return notification.kind === 'comment'
    ? notification.id
    : `acquisition:${notification.id}`
}

function formatNotificationDate(value: string) {
  return new Intl.DateTimeFormat('fr-CH', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function getCommentPreview(html: string) {
  return html
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}


export default function HeaderNav() {
  const pathname = usePathname()
  const { role, loading, user } = useSessionProfile()
  const [notifications, setNotifications] = useState<MenuNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const seenVersionsRef = useRef<Record<string, string>>({})
  const notificationMenuRef = useRef<HTMLDivElement | null>(null)

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

  const isLoggedIn = !!role

  useEffect(() => {
    if (loading || !user?.id) return

    const storageKey = `artwork-comment-notifications:${user.id}`
    let disposed = false
    let baselineInitialized = false

    try {
      const stored = localStorage.getItem(storageKey)
      if (stored !== null) {
        const parsed: unknown = JSON.parse(stored)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          seenVersionsRef.current = parsed as Record<string, string>
          baselineInitialized = true
        }
      }
    } catch {
      seenVersionsRef.current = {}
    }

    const refreshNotifications = async () => {
      const [commentsResult, acquisitionsResult] = await Promise.all([
        supabase
          .from('artwork_viewer_comments')
          .select('id, artwork_id, user_id, comment, created_at, updated_at')
          .neq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(100),
        supabase
          .from('artwork_acquisition_events')
          .select('id, artwork_id, actor_id, created_at')
          .order('created_at', { ascending: false })
          .limit(100),
      ])

      if (disposed) return
      if (commentsResult.error) {
        console.error('Erreur chargement notifications commentaires:', {
          code: commentsResult.error.code,
          message: commentsResult.error.message,
          details: commentsResult.error.details,
          hint: commentsResult.error.hint,
        })
        return
      }
      if (acquisitionsResult.error) {
        console.error('Erreur chargement notifications d’acquisition:', {
          code: acquisitionsResult.error.code,
          message: acquisitionsResult.error.message,
          details: acquisitionsResult.error.details,
          hint: acquisitionsResult.error.hint,
        })
      }

      const commentRows = (commentsResult.data ?? []) as Omit<
        CommentNotification,
        'kind' | 'authorEmail' | 'artworkLabel'
      >[]
      const acquisitionRows = (acquisitionsResult.data ?? []) as Omit<
        AcquisitionNotification,
        'kind' | 'authorEmail' | 'artworkLabel'
      >[]
      const userIds = [...new Set([
        ...commentRows.map((comment) => comment.user_id),
        ...acquisitionRows.flatMap((event) => event.actor_id ? [event.actor_id] : []),
      ])]
      let profiles: { id: string; email: string }[] = []

      if (userIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, email')
          .in('id', userIds)

        if (profilesError) {
          console.error('Erreur chargement auteurs des commentaires:', profilesError.message)
        } else {
          profiles = profilesData ?? []
        }
      }

      const artworkIds = [...new Set([
        ...commentRows.map((comment) => comment.artwork_id),
        ...acquisitionRows.map((event) => event.artwork_id),
      ])]
      let artworkDetails: {
        id: string
        title: string | null
        artist: { first_name: string | null; last_name: string | null }[] | null
      }[] = []

      if (artworkIds.length > 0) {
        const { data: artworksData, error: artworksError } = await supabase
          .from('artworks')
          .select('id, title, artist:artists(first_name, last_name)')
          .in('id', artworkIds)

        if (artworksError) {
          console.error('Erreur chargement détails des œuvres des notifications:', artworksError.message)
        } else {
          artworkDetails = (artworksData ?? []) as typeof artworkDetails
        }
      }

      if (disposed) return

      const profileById = new Map(profiles.map((profile) => [profile.id, profile.email]))
      const artworkLabelById = new Map(
        artworkDetails.map((artwork) => {
          const artist = artwork.artist?.[0]
          const artistName = [artist?.first_name, artist?.last_name]
            .filter(Boolean)
            .join(' ')
          return [artwork.id, [artistName, artwork.title].filter(Boolean).join(' — ') || 'Œuvre sans titre']
        })
      )
      const commentNotifications: CommentNotification[] = commentRows.map((comment) => ({
        ...comment,
        kind: 'comment',
        authorEmail: profileById.get(comment.user_id) ?? null,
        artworkLabel: artworkLabelById.get(comment.artwork_id) ?? 'Œuvre sans titre',
      }))
      const acquisitionNotifications: AcquisitionNotification[] = acquisitionRows.map((event) => ({
        ...event,
        kind: 'acquisition',
        authorEmail: event.actor_id ? profileById.get(event.actor_id) ?? null : null,
        artworkLabel: artworkLabelById.get(event.artwork_id) ?? 'Œuvre sans titre',
      }))
      const nextNotifications: MenuNotification[] = [
        ...commentNotifications,
        ...acquisitionNotifications,
      ].sort(
        (first, second) =>
          new Date(notificationVersion(second)).getTime() -
          new Date(notificationVersion(first)).getTime()
      )

      if (!baselineInitialized) {
        const initialVersions = Object.fromEntries(
          commentNotifications.map((comment) => [comment.id, comment.updated_at])
        )
        seenVersionsRef.current = initialVersions
        baselineInitialized = true
        try {
          localStorage.setItem(storageKey, JSON.stringify(initialVersions))
        } catch {
          // Notifications still work for this page session if storage is unavailable.
        }
      }

      setNotifications(nextNotifications)
      setUnreadCount(
        nextNotifications.filter(
          (notification) =>
            seenVersionsRef.current[notificationSeenKey(notification)] !==
            notificationVersion(notification)
        ).length
      )
    }

    void refreshNotifications()
    const interval = window.setInterval(() => void refreshNotifications(), 30_000)
    const handleFocus = () => void refreshNotifications()
    window.addEventListener('focus', handleFocus)

    return () => {
      disposed = true
      window.clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
    }
  }, [loading, user?.id])

  useEffect(() => {
    if (!notificationsOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !notificationMenuRef.current?.contains(event.target)
      ) {
        setNotificationsOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNotificationsOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [notificationsOpen])

  function markNotificationsRead() {
    if (!user?.id) return

    const updatedVersions = { ...seenVersionsRef.current }
    notifications.forEach((notification) => {
      updatedVersions[notificationSeenKey(notification)] = notificationVersion(notification)
    })
    seenVersionsRef.current = updatedVersions
    setUnreadCount(0)

    try {
      localStorage.setItem(
        `artwork-comment-notifications:${user.id}`,
        JSON.stringify(updatedVersions)
      )
    } catch {
      // The in-memory read state remains active until navigation or refresh.
    }
  }

  return (


<header className="no-print app-header">


      {/* LEFT NAV */}
      <nav className="app-header-nav">
        {/* ✅ Home : seulement si logué */}
        {isLoggedIn && (
          <Link
            href="/"
            prefetch={false}
            style={navLink(isActive('/'))}
          >
            Home
          </Link>
        )}

        {isLoggedIn && (
          <Link
            href="/artworks/active"
            prefetch={false}
            style={navLink(isActive('/artworks/active'))}
          >
            Active
          </Link>
        )}

                {isLoggedIn && (
          <Link
            href="/artworks"
            prefetch={false}
            style={navLink(pathname === '/artworks')}
          >
            All
          </Link>
        )}


          {isLoggedIn && (
          <Link
            href="/artworks/updated"
            prefetch={false}
            style={navLink(isActive('/artworks/updated'))}
          >
            Updated
          </Link>
        )}

        {isLoggedIn && (
          <Link
            href="/artworks/import-label"
            prefetch={false}
            style={navLink(isActive('/artworks/import-label'))}
          >
            Import
          </Link>
        )}

        {isLoggedIn && (
          <Link
            href="/library"
            prefetch={false}
            style={navLink(isActive('/library'))}
          >
            Library
          </Link>
        )}

      </nav>

      {/* RIGHT ACTIONS */}
      <div className="app-header-actions">
        {isLoggedIn && (
          <div ref={notificationMenuRef} style={notificationMenuStyle}>
            <button
              type="button"
              aria-label={`Messages et acquisitions${unreadCount ? `, ${unreadCount} alertes non lues` : ''}`}
              aria-expanded={notificationsOpen}
              title="Messages et acquisitions"
              onClick={() => {
                const opening = !notificationsOpen
                setNotificationsOpen(opening)
                if (opening) markNotificationsRead()
              }}
              style={notificationButtonStyle}
            >
              <svg
                aria-hidden="true"
                width="20"
                height="20"
                style={{ width: 20, height: 20, flexShrink: 0 }}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                <path d="M10 21h4" />
              </svg>
              {unreadCount > 0 ? (
                <span style={notificationBadgeStyle}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              ) : null}
            </button>

            {notificationsOpen ? (
              <div role="dialog" aria-label="Messages" style={notificationPanelStyle}>
                <div style={notificationPanelHeaderStyle}>
                  <strong>Messages et acquisitions</strong>
                  <span>
                    {unreadCount > 0
                      ? `${unreadCount} alerte${unreadCount > 1 ? 's' : ''} non lue${unreadCount > 1 ? 's' : ''}`
                      : 'Activité récente'}
                  </span>
                </div>

                {notifications.length === 0 ? (
                  <p style={emptyNotificationsStyle}>Aucune activité récente.</p>
                ) : (
                  notifications.slice(0, 8).map((comment) => {
                    const isModified =
                      comment.kind === 'comment' && comment.updated_at > comment.created_at
                    const preview =
                      comment.kind === 'comment'
                        ? getCommentPreview(comment.comment)
                        : comment.artworkLabel
                    const notificationDate = notificationVersion(comment)

                    return (
                      <Link
                        key={comment.id}
                        href={`/artworks/print/${comment.artwork_id}`}
                        onClick={() => setNotificationsOpen(false)}
                        style={notificationItemStyle}
                      >
                        <span style={notificationItemMetaStyle}>
                          <strong>{comment.authorEmail || 'Utilisateur'}</strong>
                          <span>
                            {comment.kind === 'acquisition'
                              ? 'New acquisition'
                              : isModified
                                ? 'Commentaire modifié'
                                : 'Nouveau commentaire'}
                          </span>
                        </span>
                        {comment.kind === 'comment' ? (
                          <span style={notificationArtworkStyle}>{comment.artworkLabel}</span>
                        ) : null}
                        <span style={notificationPreviewStyle}>
                          {comment.kind === 'comment'
                            ? preview || 'Commentaire sans texte'
                            : preview}
                        </span>
                        <time style={notificationDateStyle} dateTime={notificationDate}>
                          {formatNotificationDate(notificationDate)}
                        </time>
                      </Link>
                    )
                  })
                )}
              </div>
            ) : null}
          </div>
        )}

        {/* Chargement → rien */}
        {loading && null}

        {/* ✅ NON CONNECTÉ → Login (pas de prefetch) */}
        {!loading && !isLoggedIn && (
          <Link href="/login" prefetch={false}>
            <button className="edit-button">Login</button>
          </Link>
        )}

        {/* ✅ CONNECTÉ → Logout avec hard redirect */}
        {!loading && isLoggedIn && (
          <button
            className="edit-button"
            onClick={async () => {
              await supabase.auth.signOut()
              // 🔥 force un nouveau cycle serveur (vide le cache Next)
              window.location.href = '/login'
            }}
          >
            Logout
          </button>
        )}
      </div>
    </header>
  )
}

const notificationMenuStyle: React.CSSProperties = {
  position: 'relative',
}

const notificationButtonStyle: React.CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 40,
  height: 40,
  border: '1px solid rgba(255,255,255,0.34)',
  borderRadius: 7,
  background: 'rgba(255,255,255,0.10)',
  color: '#fff',
  cursor: 'pointer',
}

const notificationBadgeStyle: React.CSSProperties = {
  position: 'absolute',
  top: -6,
  right: -6,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 18,
  height: 18,
  padding: '0 4px',
  border: '2px solid #006b42',
  borderRadius: 10,
  background: '#d34b3f',
  color: '#fff',
  fontSize: 10,
  fontWeight: 700,
}

const notificationPanelStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 12px)',
  right: 0,
  zIndex: 1100,
  width: 'min(360px, calc(100vw - 24px))',
  maxHeight: 'min(70vh, 560px)',
  overflowY: 'auto',
  border: '1px solid #d7dfda',
  borderRadius: 8,
  background: '#fff',
  color: '#17231e',
  boxShadow: '0 12px 32px rgba(15, 48, 36, 0.2)',
}

const notificationPanelHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  padding: '12px 14px',
  borderBottom: '1px solid #e5e9e6',
  fontSize: 13,
}

const notificationItemStyle: React.CSSProperties = {
  display: 'grid',
  gap: 5,
  padding: '11px 14px',
  borderBottom: '1px solid #edf0ee',
  color: 'inherit',
  textDecoration: 'none',
}

const notificationItemMetaStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 10,
  fontSize: 12,
}

const notificationPreviewStyle: React.CSSProperties = {
  display: '-webkit-box',
  overflow: 'hidden',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2,
  fontSize: 13,
  lineHeight: 1.4,
  overflowWrap: 'anywhere',
}

const notificationArtworkStyle: React.CSSProperties = {
  color: '#42534a',
  fontSize: 12,
}

const notificationDateStyle: React.CSSProperties = {
  color: '#6b756f',
  fontSize: 11,
}

const emptyNotificationsStyle: React.CSSProperties = {
  margin: 0,
  padding: '16px 14px',
  color: '#6b756f',
  fontSize: 13,
}

function navLink(active: boolean): React.CSSProperties {
  return {
    color: active ? '#ffffff' : 'rgba(255,255,255,0.78)',
    fontWeight: 700,
    textDecoration: 'none',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontSize: '0.92rem',
    borderRadius: 7,
    background: active ? 'rgba(255,255,255,0.14)' : 'transparent',
    padding: '9px 12px',
    transition: 'background-color 120ms ease, color 120ms ease',
  }
}
