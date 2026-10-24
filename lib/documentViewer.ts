export function documentReturnPath(value: string | undefined, fallback = '/artworks'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') ||
      /[\\\u0000-\u001f]/.test(value) ||
      /^\/(?:api|documents)(?:\/|[?#]|$)/.test(value)) {
    return fallback
  }
  return value
}

export function iphoneDocumentViewerUrl(request: Request, documentId: string, artworkId: string | null): URL | null {
  const url = new URL(request.url)
  const isNavigation = request.headers.get('sec-fetch-dest') === 'document' ||
    request.headers.get('accept')?.includes('text/html')
  if (!/iPhone|iPod/i.test(request.headers.get('user-agent') ?? '') ||
      !isNavigation || url.searchParams.get('embedded') === '1' ||
      url.searchParams.get('download') === '1') {
    return null
  }

  const fallback = artworkId ? `/artworks/print/${encodeURIComponent(artworkId)}` : '/market'
  const referrer = request.headers.get('referer')
  let returnTo = fallback
  if (referrer && URL.canParse(referrer)) {
    const previous = new URL(referrer)
    if (previous.origin === url.origin) {
      returnTo = documentReturnPath(`${previous.pathname}${previous.search}${previous.hash}`, fallback)
    }
  }

  const viewer = new URL(`/documents/${encodeURIComponent(documentId)}/view`, url)
  viewer.searchParams.set('returnTo', returnTo)
  return viewer
}
