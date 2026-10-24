export function artworkStatusChange<T extends string | null>(
  artwork: { status?: string | null; view_date?: string | null },
  status: T,
  now = new Date()
): { status: T; view_date?: string | null } {
  if (status !== 'Viewed' || artwork.status === 'Viewed' || artwork.view_date) {
    return { status }
  }

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Zurich',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(item => item.type === type)?.value

  return { status, view_date: `${part('year')}-${part('month')}-${part('day')}` }
}
