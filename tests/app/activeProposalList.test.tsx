import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ArtworkList from '@/components/artwork/ArtworkList'
import { getLocationText } from '@/components/artwork/artworkListHelpers'
import type { ArtworkListItem } from '@/app/(protected)/types/artwork'

const session = vi.hoisted(() => ({ role: 'Editor' }))

vi.mock('@/contexts/SessionContext', () => ({
  useSessionProfile: () => session,
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

const artwork: ArtworkListItem = {
  id: 'work',
  proposed_by_label: 'Seller Gallery',
  location: { id: 'location', company_name: 'Storage Geneva' },
  status: 'Negotiation',
  priority: 'High',
  proposals: [{ contact_id: 'client', contact_label: 'Private Client' }],
}

function render(props: Partial<React.ComponentProps<typeof ArtworkList>> = {}) {
  const html = renderToStaticMarkup(
    <ArtworkList artworks={[artwork]} {...props} />
  )
  const header = html.match(/<thead>([\s\S]*?)<\/thead>/)?.[1] ?? ''
  const cells = [...(html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? '')
    .matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(match => match[1])
  return { html, header, cells }
}

beforeEach(() => {
  session.role = 'Editor'
})

describe('active proposal list layout', () => {
  it.each(['market', 'auction'] as const)('moves Proposed to below Status/Priority for %s', mode => {
    const { header, cells } = render({
      mode,
      canEditStatusPriority: true,
      statusOptions: ['Negotiation'],
      onUpdateArtworkField: vi.fn(),
    })
    expect(header.indexOf('Location')).toBeGreaterThan(header.indexOf('Proposed by'))
    expect(header.indexOf('Proposed to')).toBeGreaterThan(header.indexOf('Priority'))
    expect(cells[1]).toContain('Seller Gallery')
    expect(cells[1].indexOf('Storage Geneva')).toBeGreaterThan(cells[1].indexOf('Seller Gallery'))
    expect(cells[1]).not.toContain('Private Client')
    expect(cells[3]).toMatch(/display:flex;flex-direction:row;gap:4px;align-items:flex-end/)
    expect(cells[3]).toContain('aria-label="Status"')
    expect(cells[3]).toContain('aria-label="Priority"')
    expect(cells[3].indexOf('Private Client')).toBeGreaterThan(cells[3].lastIndexOf('</select>'))
  })

  it.each(['Viewer', 'viewer'])('keeps Proposed to hidden for %s without hiding Proposed by', role => {
    session.role = role
    const { html, cells } = render()
    expect(html).not.toContain('Proposed to')
    expect(html).not.toContain('Private Client')
    expect(cells[1]).toContain('Seller Gallery')
    expect(cells[1]).toContain('Storage Geneva')
    expect(cells[3]).toContain('Negotiation • High')
  })

  it('shows Proposed to to administrators', () => {
    session.role = 'Administrator'
    expect(render().cells[3]).toContain('Private Client')
  })

  it.each([
    { section: 'archived' as const },
    { mode: 'bought' as const },
  ])('preserves other list layouts: %j', props => {
    const { header, cells } = render(props)
    expect(header).not.toContain('Location')
    expect(cells[1]).toContain('Private Client')
    expect(cells[3]).not.toContain('Private Client')
  })
})

describe('proposal location label', () => {
  it('prefers the current contact over the legacy location', () => {
    expect(getLocationText({ ...artwork, location_of_work: 'Old storage' })).toBe('Storage Geneva')
  })

  it('uses the contact name when no company is provided', () => {
    expect(getLocationText({
      id: 'work',
      location: { id: 'person', first_name: ' Jane ', last_name: ' Doe ' },
    })).toBe('Jane Doe')
  })

  it('supports legacy locations and missing values', () => {
    expect(getLocationText({ id: 'work', location_of_work: ' Paris ' })).toBe('Paris')
    expect(getLocationText({ id: 'work' })).toBe('—')
  })
})
