import { readFileSync } from 'node:fs'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import ProtectedLayout from '@/app/(protected)/layout'

const mocks = vi.hoisted(() => ({ pathname: '/artworks/print/work' }))
vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: vi.fn() }),
}))
vi.mock('@/components/layout/HeaderNav', () => ({ default: () => null }))
vi.mock('@/contexts/SessionContext', () => ({
  SessionProvider: ({ children }: { children: ReactNode }) => children,
  useSessionProfile: () => ({ role: 'Editor', loading: false }),
}))
vi.mock('@/contexts/ClientFilterContext', () => ({
  ClientFilterProvider: ({ children }: { children: ReactNode }) => children,
}))

it.each([
  ['/artworks/print/work', 'factsheets'],
  ['/artworks/print/category', 'factsheets'],
  ['/artworks/print', 'factsheets'],
  ['/artworks/active', 'proposals'],
  ['/artworks/bought', 'collection'],
])('uses the correct background section for %s', (pathname, section) => {
  mocks.pathname = pathname
  expect(renderToStaticMarkup(<ProtectedLayout>Content</ProtectedLayout>))
    .toContain(`data-page-section="${section}"`)
})

it('sets the factsheet page background to white', () => {
  const css = readFileSync('app\\globals.css', 'utf8')
  expect(css).toMatch(/\.protected-page-shell\[data-page-section='factsheets'\]\s*\{\s*--section-page-bg: #ffffff;/)
})
