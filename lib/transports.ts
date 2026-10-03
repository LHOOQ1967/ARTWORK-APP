const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
export const TRANSPORT_CURRENCIES = ['CHF', 'EUR', 'USD', 'GBP', 'HKD'] as const

function dateOrNull(value: unknown): string | null | undefined {
  if (value === null || value === '') return null
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return undefined
  return Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) ? undefined : value
}

function idOrNull(value: unknown): string | null | undefined {
  if (value === null || value === '') return null
  return typeof value === 'string' ? value : undefined
}

type Result = Record<string, string | null>

function collect(
  body: Record<string, unknown> | null,
  fields: Record<string, (value: unknown) => string | null | undefined>,
  required: string[]
): Result | null {
  if (!body) return null
  const result: Result = {}
  for (const [key, parse] of Object.entries(fields)) {
    if (!(key in body)) {
      if (required.includes(key)) return null
      continue
    }
    const parsed = parse(body[key])
    if (parsed === undefined) return null
    if (required.includes(key) && parsed === null) return null
    result[key] = parsed
  }
  return result
}

const text = (value: unknown) =>
  value === null ? null : typeof value === 'string' ? value.trim() || null : undefined

const httpUrl = (value: unknown) => {
  if (value === null || value === '') return null
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? trimmed : undefined
  } catch {
    return undefined
  }
}

export function parseTransportInput(body: Record<string, unknown> | null, isCreate: boolean) {
  return collect(
    body,
    {
      artwork_id: idOrNull,
      origin_contact_id: idOrNull,
      destination_contact_id: idOrNull,
      origin_address_id: idOrNull,
      destination_address_id: idOrNull,
      instruction_contact_id: idOrNull,
      instruction_date: dateOrNull,
      transport_date: dateOrNull,
      arrival_date: dateOrNull,
      notes: text,
      final_invoice_pdf_url: httpUrl,
    },
    isCreate ? ['artwork_id'] : []
  )
}

export function parseQuoteInput(body: Record<string, unknown> | null, isCreate: boolean) {
  const result = collect(
    body,
    {
      carrier_contact_id: idOrNull,
      quote_date: dateOrNull,
      submitted_to_buyer_date: dateOrNull,
      accepted_date: dateOrNull,
      quote_pdf_url: httpUrl,
      currency: (value) =>
        typeof value === 'string' &&
        (TRANSPORT_CURRENCIES as readonly string[]).includes(value.toUpperCase())
          ? value.toUpperCase()
          : undefined,
    },
    []
  )
  if (!result || !body) return null

  const out: Record<string, string | number | null> = { ...result }
  if ('amount' in body || isCreate) {
    const raw = body.amount
    if (raw === null || raw === '' || raw === undefined) {
      out.amount = null
    } else {
      const amount = typeof raw === 'number' ? raw : Number(raw)
      if (!Number.isFinite(amount) || amount < 0) return null
      out.amount = amount
    }
  }
  return out
}
