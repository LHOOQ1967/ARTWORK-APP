import { formatArtworkYears } from '@/lib/artworkYears'

export type InsuranceEmailArtwork = {
  title: string | null
  year_execution: number | string | null
  year_execution_start?: number | null
  date_acquisition: string | null
  first_name: string | null
  last_name: string | null
  medium: string | null
  height_cm: number | null
  width_cm: number | null
  depth_cm: number | null
  insurance_value: number | null
  insurance_currency: string | null
  location_contact_name: string | null
  destination_contact_name: string | null
}

export function buildInsuranceEmail(artwork: InsuranceEmailArtwork) {
  const missingFields: string[] = []
  const text = (value: string | null | undefined, field: string) => {
    if (value?.trim()) return value.trim()
    missingFields.push(field)
    return `[${field} not specified]`
  }
  const dateValue = artwork.date_acquisition?.slice(0, 10) ?? ''
  const date = new Date(`${dateValue}T00:00:00Z`)
  const purchaseDate = /^\d{4}-\d{2}-\d{2}$/.test(dateValue) &&
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === dateValue
    ? new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date)
    : text(null, 'Purchase date')
  const artist = text([artwork.first_name, artwork.last_name].filter(Boolean).join(' '), 'Artist')
  const title = text(artwork.title, 'Title')
  const years = text(formatArtworkYears(artwork.year_execution, artwork.year_execution_start), 'Year')
  const medium = text(artwork.medium, 'Medium')
  const dimensionValues = [artwork.height_cm, artwork.width_cm, artwork.depth_cm]
    .filter((value): value is number => value !== null && Number.isFinite(value) && value > 0)
  const dimensions = text(
    dimensionValues.length > 0 ? `${dimensionValues.join(' x ')} cm` : null,
    'Dimensions'
  )
  const currency = text(artwork.insurance_currency, 'Insurance currency')
  const value = artwork.insurance_value !== null && Number.isFinite(artwork.insurance_value)
    ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(artwork.insurance_value).replace(/,/g, "'")
    : text(null, 'Insured value')
  const location = text(artwork.location_contact_name, 'Location')
  const destination = text(artwork.destination_contact_name, 'Destination')
  const body = [
    'Dear Alison,',
    '',
    'Hoping all is well with you.',
    '',
    `Thank you to insure this following work as of ${purchaseDate}:`,
    '',
    artist,
    `${title}, ${years}`,
    medium,
    dimensions,
    `Insurance: ${currency} ${value},-`,
    '',
    `This work is deposited at ${location} and will be soon shipped to ${destination}`,
    '',
    'With my thanks and my best regards,',
    'Sandrine',
  ].join('\r\n')
  const subject = `Insurance request: ${artwork.title?.trim() || 'Artwork'}`
  return {
    href: `mailto:alison.hillier@howdengroup.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
    missingFields,
  }
}
