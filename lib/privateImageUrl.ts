const artworkImagesBucket = '/storage/v1/object/public/artwork-images/'

export function privateImageUrl(url: string | null | undefined, thumbnail = false) {
  if (!url) return url ?? ''

  try {
    const parsed = new URL(url)
    if (!parsed.pathname.includes(artworkImagesBucket)) return url

    return `/api/artwork-images?url=${encodeURIComponent(url)}${thumbnail ? '&thumbnail=1' : ''}`
  } catch {
    return url
  }
}