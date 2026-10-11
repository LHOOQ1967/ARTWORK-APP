type Year = number | string | null | undefined

export function formatArtworkYears(end: Year, start?: Year): string {
  const endText = end == null ? '' : String(end)
  const startText = start == null ? '' : String(start)
  if (!startText || startText === endText) return endText
  return endText ? `${startText}/${endText}` : startText
}

export function artworkYearError(start: unknown, end: unknown): string | null {
  if (start == null) return null
  if (typeof start !== 'number' || !Number.isInteger(start)) {
    return 'Year (start) must be a whole number.'
  }
  if (typeof end !== 'number' || !Number.isInteger(end)) {
    return 'Year (end) is required when Year (start) is entered.'
  }
  return start > end ? 'Year (start) must not be later than Year (end).' : null
}
