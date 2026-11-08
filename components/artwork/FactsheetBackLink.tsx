'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

export function factsheetReturnUrl(value: string | null) {
  if (!value || !/^\/artworks(?:\/(?:active|archived|bought))?(?:\?|$)/.test(value)) {
    return '/artworks/active'
  }
  return value
}

export default function FactsheetBackLink() {
  const href = factsheetReturnUrl(useSearchParams()?.get('returnTo') ?? null)
  return <Link href={href} className="no-print edit-button">
    Back
  </Link>
}
