'use client'

import { useEffect, useEffectEvent, useState, type CSSProperties } from 'react'
import { fetchWithAuth } from '@/lib/fetchWithAuth'
import { auctionCities, isPremiumCalculation, isRecord, type PremiumInputField } from '@/lib/auctionPremium'

export type PremiumPair = 'suggestion' | 'result'
export type PremiumPendingChange = (pair: PremiumPair, pending: boolean) => void

type Props = {
  label: string
  houseId?: string | null
  saleDate?: string | null
  currency?: string | null
  hammer?: number | null
  premium?: number | null
  disabled: boolean
  inputStyle?: CSSProperties
  onChange: (amounts: { hammer?: number | null; premium?: number | null }) => void
  onPendingChange?: (pending: boolean) => void
}

export function AuctionPremiumFields({
  label, houseId, saleDate, currency, hammer, premium, disabled, inputStyle,
  onChange, onPendingChange,
}: Props) {
  const [automatic, setAutomatic] = useState(true)
  const [source, setSource] = useState<{ field: PremiumInputField; amount: number } | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [schedule, setSchedule] = useState<string | null>(null)
  const reportPending = useEffectEvent((value: boolean) => onPendingChange?.(value))
  const applyResult = useEffectEvent((field: PremiumInputField, result: { hammer: number; total: number }) => {
    onChange(field === 'hammer' ? { premium: result.total } : { hammer: result.hammer })
  })

  useEffect(() => {
    if (!source || !automatic || disabled) {
      reportPending(false)
      return
    }
    const controller = new AbortController()
    let cancelled = false
    reportPending(true)
    const timer = setTimeout(async () => {
      setSchedule(null)
      setError(null)
      if (!houseId || !saleDate || !currency || !Object.hasOwn(auctionCities, currency) ||
          !Number.isFinite(source.amount) || source.amount < 0) {
        setError('Select an auction house, sale date and USD, GBP, HKD or EUR currency. Otherwise switch off Auto and enter both amounts manually.')
        setPending(false)
        return
      }
      setPending(true)
      reportPending(true)
      let completed = false
      try {
        const response = await fetchWithAuth('/api/auctions/premium', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({ houseId, date: saleDate, currency, field: source.field, amount: source.amount }),
        })
        if (cancelled) return
        const result: unknown = await response.json()
        if (cancelled) return
        if (!response.ok) {
          throw new Error(isRecord(result) && typeof result.error === 'string' ? result.error : 'Buyer premium calculation failed.')
        }
        if (!isPremiumCalculation(result) || result.currency !== currency) {
          throw new Error('The calculator returned an invalid result.')
        }
        applyResult(source.field, result)
        setSchedule(`${result.house}: scale valid from ${result.schedule.valid_from}`)
        completed = true
      } catch (cause) {
        if (cancelled) return
        console.error('Automatic buyer premium calculation failed', cause)
        setError(cause instanceof Error ? cause.message : 'Buyer premium calculation failed. Enter both amounts manually or retry.')
      } finally {
        if (!cancelled) {
          setPending(false)
          if (completed) reportPending(false)
        }
      }
    }, 450)
    return () => {
      cancelled = true
      clearTimeout(timer)
      controller.abort()
    }
  }, [source, automatic, disabled, houseId, saleDate, currency])

  useEffect(() => () => { reportPending(false) }, [])

  function edit(field: PremiumInputField, value: string) {
    const amount = value === '' ? null : Number(value)
    setError(null)
    setSchedule(null)
    setSource(amount === null ? null : { field, amount })
    setPending(automatic && amount !== null)
    onPendingChange?.(automatic && amount !== null)
    onChange(field === 'hammer' ? { hammer: amount } : { premium: amount })
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="number" min="0" step="0.01" placeholder="Hammer" aria-label={`${label} hammer`}
          value={hammer ?? ''} disabled={disabled}
          onChange={event => edit('hammer', event.target.value)}
          style={{ ...inputStyle, width: 120 }}
        />
        <input
          type="number" min="0" step="0.01" placeholder="Premium" aria-label={`${label} including premium`}
          value={premium ?? ''} disabled={disabled}
          onChange={event => edit('total', event.target.value)}
          style={{ ...inputStyle, width: 120 }}
        />
        <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: '0.85rem' }}>
          <input
            type="checkbox" checked={automatic} disabled={disabled}
            aria-label={`Automatically calculate ${label.toLowerCase()}`}
            onChange={event => {
              setAutomatic(event.target.checked)
              setError(null)
              setSchedule(null)
              const willCalculate = event.target.checked && source !== null
              setPending(willCalculate)
              onPendingChange?.(willCalculate)
            }}
          />
          Auto
        </label>
      </div>
      {automatic && !disabled && (
        <p style={{ fontSize: '0.8rem', marginTop: 6 }}>
          {currency && auctionCities[currency] ? `${auctionCities[currency]} (${currency}). ` : ''}
          Premium means hammer plus buyer&apos;s premium. Calculation uses the sale date and excludes additional taxes.
        </p>
      )}
      {pending && <p role="status" style={{ fontSize: '0.85rem', marginTop: 6 }}>Calculating buyer&apos;s premium...</p>}
      {error && (
        <div role="alert" style={{ color: '#8b0000', fontSize: '0.85rem', marginTop: 6 }}>
          {error} Switch off Auto to enter both amounts manually.{' '}
          <button type="button" disabled={disabled} onClick={() => {
            if (source) {
              setSource({ ...source })
              setPending(true)
              onPendingChange?.(true)
            }
          }}>Retry</button>
        </div>
      )}
      {schedule && <p role="status" style={{ fontSize: '0.8rem', marginTop: 6 }}>{schedule}</p>}
    </div>
  )
}
