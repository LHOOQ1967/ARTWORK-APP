const artworkImagesBucket = '/storage/v1/object/public/artwork-images/'

export function privateImageUrl(url: string | null | undefined) {
  if (!url) return url ?? ''

  try {
    const parsed = new URL(url)
    if (!parsed.pathname.includes(artworkImagesBucket)) return url

    return `/api/artwork-images?url=${encodeURIComponent(url)}`
  } catch {
    return url
  }
}