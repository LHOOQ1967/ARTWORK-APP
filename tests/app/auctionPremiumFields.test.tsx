// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuctionPremiumFields } from '@/components/artwork/AuctionPremiumFields'

const mocks = vi.hoisted(() => ({ fetchWithAuth: vi.fn() }))
vi.mock('@/lib/fetchWithAuth', () => ({ fetchWithAuth: mocks.fetchWithAuth }))

const result = {
  house: "Christie's", currency: 'USD', date: '2026-10-24', field: 'hammer', amount: 100,
  hammer: 100, total: 127, schedule: { valid_from: '2026-01-01', valid_to: null },
}
let container: HTMLDivElement
let root: Root
const pending = vi.fn()

function Form({ initialHammer = null, initialPremium = null }: { initialHammer?: number | null; initialPremium?: number | null }) {
  const [values, setValues] = useState({ hammer: initialHammer, premium: initialPremium })
  const [currency, setCurrency] = useState('USD')
  return <><button type="button" onClick={() => setCurrency('CHF')}>Use CHF</button><AuctionPremiumFields label="Result" houseId="house-1" saleDate="2026-10-24" currency={currency}
    {...values} disabled={false} onPendingChange={pending}
    onChange={amounts => setValues(previous => ({ ...previous, ...amounts }))} /></>
}

async function render(props = {}) {
  await act(async () => root.render(<Form {...props} />))
}
async function enter(label: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function calculate() {
  await act(async () => { await vi.advanceTimersByTimeAsync(450) })
}

describe('automatic auction premium fields', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    mocks.fetchWithAuth.mockImplementation(() => Promise.resolve(Response.json(result)))
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('does not recalculate existing saved amounts on mount', async () => {
    await render({ initialHammer: 100, initialPremium: 150 })
    await calculate()
    expect(mocks.fetchWithAuth).not.toHaveBeenCalled()
    expect(container.querySelector<HTMLInputElement>('[aria-label="Result including premium"]')!.value).toBe('150')
  })

  it('calculates the total after editing hammer and reports pending immediately', async () => {
    await render()
    await enter('Result hammer', '100')
    expect(pending).toHaveBeenLastCalledWith(true)
    await calculate()
    expect(container.querySelector<HTMLInputElement>('[aria-label="Result including premium"]')!.value).toBe('127')
    expect(pending).toHaveBeenLastCalledWith(false)
    const body = JSON.parse(mocks.fetchWithAuth.mock.calls[0][1].body)
    expect(body).toMatchObject({ field: 'hammer', amount: 100, currency: 'USD' })
  })

  it('inverts the total rather than treating it as the fee alone', async () => {
    mocks.fetchWithAuth.mockImplementation(() => Promise.resolve(Response.json({ ...result, field: 'total', amount: 127 })))
    await render()
    await enter('Result including premium', '127')
    await calculate()
    expect(container.querySelector<HTMLInputElement>('[aria-label="Result hammer"]')!.value).toBe('100')
    expect(JSON.parse(mocks.fetchWithAuth.mock.calls[0][1].body)).toMatchObject({ field: 'total', amount: 127 })
  })

  it('ignores stale responses after the user switches the input field', async () => {
    let resolveFirst!: (response: Response) => void
    mocks.fetchWithAuth.mockImplementationOnce(() => new Promise<Response>(resolve => { resolveFirst = resolve }))
    await render()
    await enter('Result hammer', '100')
    await calculate()
    await enter('Result including premium', '254')
    await act(async () => resolveFirst(Response.json(result)))
    expect(container.querySelector<HTMLInputElement>('[aria-label="Result including premium"]')!.value).toBe('254')
    mocks.fetchWithAuth.mockImplementation(() => Promise.resolve(Response.json({ ...result, field: 'total', amount: 254, hammer: 200, total: 254 })))
    await calculate()
    expect(container.querySelector<HTMLInputElement>('[aria-label="Result hammer"]')!.value).toBe('200')
  })

  it('cancels old calculations when the currency changes and never guesses a CHF city', async () => {
    let resolveFirst!: (response: Response) => void
    mocks.fetchWithAuth.mockImplementationOnce(() => new Promise<Response>(resolve => { resolveFirst = resolve }))
    await render()
    await enter('Result hammer', '100')
    await calculate()
    await act(async () => container.querySelector<HTMLButtonElement>('button')!.click())
    await act(async () => resolveFirst(Response.json(result)))
    await calculate()
    expect(container.querySelector<HTMLInputElement>('[aria-label="Result including premium"]')!.value).toBe('')
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('enter both amounts manually')
    expect(pending).toHaveBeenLastCalledWith(true)
  })

  it('reports missing scales without silently changing the other value', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.fetchWithAuth.mockImplementation(() => Promise.resolve(Response.json({ error: 'No premium scale for this date' }, { status: 422 })))
    await render({ initialPremium: 150 })
    await enter('Result hammer', '100')
    await calculate()
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('No premium scale for this date')
    expect(container.querySelector<HTMLInputElement>('[aria-label="Result including premium"]')!.value).toBe('150')
    expect(pending).toHaveBeenLastCalledWith(true)
  })

  it('allows manual overrides with Auto switched off', async () => {
    await render()
    await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click())
    await enter('Result hammer', '100')
    await enter('Result including premium', '130')
    await calculate()
    expect(mocks.fetchWithAuth).not.toHaveBeenCalled()
    expect(container.querySelector<HTMLInputElement>('[aria-label="Result including premium"]')!.value).toBe('130')
  })
})
