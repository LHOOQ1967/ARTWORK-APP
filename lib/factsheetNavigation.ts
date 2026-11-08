export function artworkNavigationUrl(path: string, returnTo: string | null | undefined) {
  if (!returnTo || !/^\/artworks(?:\/(?:active|archived|bought))?(?:\?|$)/.test(returnTo)) {
    return path
  }
  return `${path}?${new URLSearchParams({ returnTo })}`
}
