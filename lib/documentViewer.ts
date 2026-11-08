export function documentReturnPath(value: string | undefined, fallback = '/artworks'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') ||
      /[\\\u0000-\u001f]/.test(value) ||
      /^\/(?:api|documents)(?:\/|[?#]|$)/.test(value)) {
    return fallback
  }
  return value
}
