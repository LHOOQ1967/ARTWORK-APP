// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import FactsheetBackLink, { factsheetReturnUrl } from '@/components/artwork/FactsheetBackLink'

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}))

it('preserves the original proposal route and filters', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const destination = '/artworks/active?marketType=auction&artistId=artist&search=bronze'
  window.history.replaceState(null, '', `/artworks/print/work?${new URLSearchParams({ returnTo: destination })}`)
  const container = document.createElement('div')
  const root = createRoot(container)
  try {
    await act(async () => root.render(<FactsheetBackLink />))
    expect(container.querySelector('a')?.getAttribute('href')).toBe(destination)
    expect(container.textContent).toBe('Back')
    expect(container.querySelector('a')?.className).toBe('no-print edit-button')
    const changedDestination = '/artworks/archived?marketType=market&search=painting'
    window.history.replaceState(null, '', `/artworks/print/other?${new URLSearchParams({ returnTo: changedDestination })}`)
    await act(async () => root.render(<FactsheetBackLink />))
    expect(container.querySelector('a')?.getAttribute('href')).toBe(changedDestination)
  } finally {
    await act(async () => root.unmount())
    vi.unstubAllGlobals()
  }
})

it('rejects external and unrelated destinations', () => {
  expect(factsheetReturnUrl('https://example.com')).toBe('/artworks/active')
  expect(factsheetReturnUrl('//example.com')).toBe('/artworks/active')
  expect(factsheetReturnUrl('/artworks/print/work')).toBe('/artworks/active')
  expect(factsheetReturnUrl('/artworks/archived?search=bronze')).toBe('/artworks/archived?search=bronze')
})
