export type BlondeauSheetFields = {
  title: string | null
  medium: string | null
  signature: string | null
  edition: string | null
  year_execution: number | null
  year_execution_start: number | null
  height_cm: number | null
  width_cm: number | null
  depth_cm: number | null
}

export type ArtworkImageCrop = { x: number; y: number; width: number; height: number }

const FIELD_LABELS: Record<'title' | 'medium' | 'signature' | 'edition', RegExp> = {
  title: /^(?:title|titre|oeuvre)\b/i,
  medium: /^(?:medium|technique|support|materiaux|matiere)\b/i,
  signature: /^(?:signature|signe|signed|marque)\b/i,
  edition: /^(?:edition|tirage|exemplaire)\b/i,
}

const ALL_LABELS = /^(?:title|titre|oeuvre|medium|technique|support|materiaux|matiere|signature|signe|signed|marque|edition|tirage|exemplaire|dimensions?|date|date de creation|annee|annees|dated|year|executed(?:\s+in)?|painted|created)\b/i
const MEDIUM_LINE = /^(?:oil|acrylic|watercolou?r|gouache|tempera|pastel|charcoal|pencil|ink|bronze|marble|wood|canvas|paper|silk|linen|panel|board|lithograph|etching|woodcut|screenprint|photograph|mixed media|ceramic|porcelain|huile|acrylique|aquarelle|gouache|tempera|pastel|fusain|crayon|encre|bronze|marbre|bois|toile|papier|soie|lin|panneau|gravure|lithographie|photographie)\b/i
const METRIC_DIMENSIONS = /(\d+(?:[.,]\d+)?)\s*(?:cm)?\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(?:cm)?(?:\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(?:cm)?)?\s*cm\b/i

function normalizeLabel(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[œŒ]/g, 'oe')
    .replace(/[æÆ]/g, 'ae')
    .trim()
}

function originalOffset(value: string, normalizedOffset: number) {
  let originalIndex = 0
  let normalizedIndex = 0
  for (const character of value) {
    if (normalizedIndex >= normalizedOffset) break
    normalizedIndex += character
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[œŒ]/g, 'oe')
      .replace(/[æÆ]/g, 'ae')
      .length
    originalIndex += character.length
  }
  return originalIndex
}

function cleanValue(value: string) {
  return value
    .replace(/^[\s:;,\-–—]+|[\s;]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function valueForLabel(lines: string[], label: RegExp): string | null {
  for (let index = 0; index < lines.length; index += 1) {
    const line = normalizeLabel(lines[index])
    const match = line.match(label)
    if (!match) continue

    const originalLine = lines[index]
    const colon = originalLine.indexOf(':')
    const valueOffset = colon >= 0
      ? colon + 1
      : originalOffset(originalLine, match[0].length)
    const sameLineValue = cleanValue(originalLine.slice(valueOffset))
    if (sameLineValue) {
      if (/^(?:signed|signe)$/i.test(match[0])) return cleanValue(originalLine)
      return sameLineValue
    }

    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
      const nextLine = normalizeLabel(lines[nextIndex])
      if (!nextLine) continue
      if (ALL_LABELS.test(nextLine)) break
      const value = cleanValue(lines[nextIndex])
      if (value) return value
    }
  }
  return null
}

function parseYears(value: string | null) {
  const text = value ?? ''
  const range = text.match(/\b((?:1[5-9]\d{2}|20\d{2}|21\d{2}))\s*[-–—/]\s*(\d{2}|(?:1[5-9]\d{2}|20\d{2}|21\d{2}))\b/)
  if (range) {
    const start = Number(range[1])
    let end = Number(range[2])
    if (range[2].length === 2) {
      end = Math.floor(start / 100) * 100 + end
      if (end < start) end += 100
    }
    return { year_execution: end, year_execution_start: start }
  }
  const years = [...new Set(text.match(/\b(?:1[5-9]\d{2}|20\d{2}|21\d{2})\b/g)?.map(Number) ?? [])]
  if (years.length === 0) return { year_execution: null, year_execution_start: null }
  if (years.length === 1) return { year_execution: years[0], year_execution_start: null }
  return {
    year_execution: Math.max(...years),
    year_execution_start: Math.min(...years),
  }
}

function parseDimensions(text: string) {
  const match = text.match(METRIC_DIMENSIONS)
  const values = match?.slice(1).filter((value): value is string => value !== undefined) ?? []
  const dimensions = values.map(value => Number(value.replace(',', '.')))
  if (dimensions.length < 2 || dimensions.some(value => !Number.isFinite(value) || value <= 0)) {
    return { height_cm: null, width_cm: null, depth_cm: null }
  }
  return {
    height_cm: dimensions[0],
    width_cm: dimensions[1],
    depth_cm: dimensions[2] ?? null,
  }
}

function titleAfterArtistHeading(lines: string[]) {
  const artistHeadingIndex = lines.findIndex(line => {
    const normalized = normalizeLabel(line)
    return /(?:18|19|20)\d{2}/.test(normalized) &&
      /[A-Z]{3,}/.test(line) &&
      /(?:\(|\b(?:born|ne|livourne|paris|london|new york)\b)/i.test(line)
  })
  if (artistHeadingIndex < 0) return null

  for (let index = artistHeadingIndex + 1; index < lines.length; index += 1) {
    const candidate = cleanValue(lines[index])
    if (!candidate) continue
    if (ALL_LABELS.test(normalizeLabel(candidate)) || MEDIUM_LINE.test(candidate) ||
      /^\d+\s*[x×]\s*\d+/i.test(candidate) || /\b(?:18|19|20)\d{2}\b/.test(candidate)) return null
    return candidate
  }
  return null
}

export function parseBlondeauSheetText(text: string): BlondeauSheetFields {
  const lines = text.split(/\r?\n/).map((line) => line.trim())
  const dateValue = valueForLabel(lines, /^(?:date(?:\s+de\s+creation)?|annees?|dated|year|executed(?:\s+in)?|painted|created)\b/i)
  const labelledMedium = valueForLabel(lines, FIELD_LABELS.medium)
  const labelledSignature = valueForLabel(lines, FIELD_LABELS.signature)
  return {
    title: valueForLabel(lines, FIELD_LABELS.title) ?? titleAfterArtistHeading(lines),
    medium: labelledMedium ?? lines.find(line => MEDIUM_LINE.test(line)) ?? null,
    signature: labelledSignature ?? lines.find(line => /^signed\b.+/i.test(line)) ?? null,
    edition: valueForLabel(lines, FIELD_LABELS.edition),
    ...parseYears(dateValue),
    ...parseDimensions(text),
  }
}

export function findArtworkImageBounds(
  width: number,
  height: number,
  pixels: Uint8ClampedArray
): ArtworkImageCrop | null {
  const scanHeight = Math.floor(height * 0.78)
  const minimumRowPixels = Math.ceil(width * 0.14)
  const rows: number[] = []
  for (let y = 0; y < scanHeight; y += 1) {
    let contentPixels = 0
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      if (pixels[offset] < 242 || pixels[offset + 1] < 242 || pixels[offset + 2] < 242) contentPixels += 1
    }
    if (contentPixels >= minimumRowPixels) rows.push(y)
  }

  let bestStart = -1
  let bestEnd = -1
  let runStart = -1
  let previousY = -1
  for (const y of rows) {
    if (runStart < 0 || y - previousY > Math.max(4, Math.ceil(height * 0.004))) {
      if (runStart >= 0 && previousY - runStart > bestEnd - bestStart) {
        bestStart = runStart
        bestEnd = previousY
      }
      runStart = y
    }
    previousY = y
  }
  if (runStart >= 0 && previousY - runStart > bestEnd - bestStart) {
    bestStart = runStart
    bestEnd = previousY
  }

  if (bestStart < 0 || bestEnd - bestStart < height * 0.12) return null

  const bandHeight = bestEnd - bestStart + 1
  const minimumColumnPixels = Math.ceil(bandHeight * 0.12)
  let left = width
  let right = -1
  for (let x = 0; x < width; x += 1) {
    let contentPixels = 0
    for (let y = bestStart; y <= bestEnd; y += 1) {
      const offset = (y * width + x) * 4
      if (pixels[offset] < 242 || pixels[offset + 1] < 242 || pixels[offset + 2] < 242) contentPixels += 1
    }
    if (contentPixels >= minimumColumnPixels) {
      left = Math.min(left, x)
      right = Math.max(right, x)
    }
  }

  if (right - left < width * 0.2) return null
  const padding = Math.max(2, Math.round(Math.min(width, height) * 0.004))
  const x = Math.max(0, left - padding)
  const y = Math.max(0, bestStart - padding)
  const endX = Math.min(width, right + padding + 1)
  const endY = Math.min(height, bestEnd + padding + 1)
  return { x, y, width: endX - x, height: endY - y }
}
