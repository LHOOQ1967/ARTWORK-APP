// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import AdminHome from '@/components/home/AdminHome'
import ViewerHome from '@/components/home/ViewerHome'
import styles from '@/components/home/HomeDashboard.module.css'

function dashboard(viewer = false) {
  const element = document.createElement('div')
  element.innerHTML = renderToStaticMarkup(viewer ? <ViewerHome /> : <AdminHome />)
  return element
}

describe('home dashboard layout', () => {
  it('places full-width Proposals and Collection above Management and Tools', () => {
    const home = dashboard()
    const shell = home.querySelector(`.${styles.shell}`)!
    expect(Array.from(shell.children).slice(0, 3).map(element => element.tagName)).toEqual(['SECTION', 'SECTION', 'DIV'])
    expect(Array.from(home.querySelectorAll('h2')).map(heading => heading.textContent)).toEqual([
      'Proposals', 'Collection', 'Management', 'Tools',
    ])
    const bottom = shell.children[2]
    expect(bottom.classList.contains(styles.sectionGrid)).toBe(true)
    expect(Array.from(bottom.querySelectorAll('h2')).map(heading => heading.textContent)).toEqual(['Management', 'Tools'])
    expect(bottom.querySelectorAll(`.${styles.linkList}`)).toHaveLength(2)
    const collection = shell.children[1]
    expect(collection.querySelector(`.${styles.collectionGrid}`)?.querySelectorAll('a')).toHaveLength(8)
    expect(collection.querySelector('a[href="/inventory/certificates"]')).not.toBeNull()
  })

  it('keeps all existing proposal, management and tool destinations and external link behavior', () => {
    const home = dashboard()
    for (const path of ['/artworks/active', '/artworks', '/artworks/updated', '/artworks/archived',
      '/artworks/print', '/artworks/import-label', '/artworks/new', '/buyer-searches',
      '/referentials', '/admin/users', '/market', '/library']) {
      expect(home.querySelector(`a[href="${path}"]`)).not.toBeNull()
    }
    for (const path of ['calculate.php', 'auction_time.php']) {
      const link = home.querySelector(`a[href="https://buyerspremium.blondeau.ch/${path}"]`)
      expect(link?.getAttribute('target')).toBe('_blank')
      expect(link?.getAttribute('rel')).toBe('noopener noreferrer')
    }
  })

  it('preserves the Viewer layout and does not expose Management links', () => {
    const home = dashboard(true)
    expect(Array.from(home.querySelectorAll('h2')).map(heading => heading.textContent)).toEqual(['Proposals', 'Collection', 'Tools'])
    const shell = home.querySelector(`.${styles.shell}`)!
    expect(shell.children[1].querySelector(`.${styles.collectionGrid}`)?.querySelectorAll('a')).toHaveLength(8)
    expect(shell.children[2].querySelectorAll(`.${styles.linkList}`)).toHaveLength(1)
    expect(home.querySelector('a[href="/admin/users"]')).toBeNull()
    expect(home.querySelector('a[href="/artworks/new"]')).toBeNull()
  })
})
