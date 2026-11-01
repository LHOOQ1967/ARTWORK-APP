// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { printCommissionCorrections } from '@/lib/printCommissionCorrections'

let frame: HTMLIFrameElement
let print = vi.fn<() => void>()

describe('commission print orientation', () => {
  beforeEach(() => {
    const append = document.body.append.bind(document.body)
    vi.spyOn(document.body, 'append').mockImplementation((...nodes) => {
      append(...nodes)
      for (const node of nodes) {
        if (!(node instanceof HTMLIFrameElement)) continue
        frame = node
        const printDocument = frame.contentDocument!
        Object.defineProperty(printDocument, 'fonts', { value: { ready: Promise.resolve() } })
        print = vi.fn<() => void>()
        vi.spyOn(frame.contentWindow!, 'print').mockImplementation(print)
        vi.spyOn(frame.contentWindow!, 'focus').mockImplementation(() => {})
      }
    })
  })

  afterEach(() => {
    frame?.remove()
    vi.restoreAllMocks()
  })

  it.each([false, true])('forces a named A4 landscape page for compact mode %s', async compact => {
    const table = document.createElement('table')
    table.innerHTML = '<tbody><tr><td>Commission</td><td><input type="date" value="2026-10-14"></td><td><button>Save</button></td></tr></tbody>'
    await printCommissionCorrections(table, 'Commissions 2026', compact)
    const printDocument = frame.contentDocument!
    const styles = printDocument.querySelector('style')!.textContent!
    expect(styles).toContain('@page { size: A4 landscape; margin: 8mm; }')
    expect(styles).toContain('@page artmuse-commissions { size: A4 landscape; margin: 8mm; }')
    expect(styles).toContain('body { page: artmuse-commissions;')
    expect(printDocument.title).toBe('Commissions 2026')
    expect(print).toHaveBeenCalledOnce()
    if (compact) {
      expect(printDocument.querySelector('button')).toBeNull()
      expect(printDocument.querySelector('input')).toBeNull()
      expect(printDocument.body.textContent).toContain('14/10/2026')
    } else {
      expect(styles).not.toContain('table-layout: fixed')
    }
    frame.contentWindow!.dispatchEvent(new Event('afterprint'))
    expect(frame.isConnected).toBe(false)
  })
})
