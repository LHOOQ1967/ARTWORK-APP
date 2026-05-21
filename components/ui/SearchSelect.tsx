
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

export type SearchOption = {
  id: string
  label: string
}

type Props = {
  label: string
  placeholder?: string
  valueId: string // 'all' ou l'id sélectionné
  onChangeId: (id: string) => void
  options: SearchOption[]
  allLabel?: string // texte pour "All"
  maxSuggestions?: number

  // ✅ Tailwind hooks
  className?: string
  inputClassName?: string
  menuClassName?: string
}

export default function SearchSelect({
  label,
  placeholder,
  valueId,
  onChangeId,
  options,
  allLabel = 'All',
  maxSuggestions = 25,
  className = '',
  inputClassName = '',
  menuClassName = '',
}: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const boxRef = useRef<HTMLDivElement | null>(null)

  const selectedLabel = useMemo(() => {
    if (valueId === 'all') return ''
    return options.find(o => o.id === valueId)?.label ?? ''
  }, [valueId, options])

  // Quand la sélection change depuis l’extérieur, on reflète dans l’input
  useEffect(() => {
    if (valueId === 'all') {
      setQuery('')
    } else if (selectedLabel) {
      setQuery(selectedLabel)
    }
  }, [valueId, selectedLabel])

  // Fermer si clic extérieur
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!boxRef.current) return
      if (!boxRef.current.contains(e.target as Node)) {
        setOpen(false)
        setActiveIndex(-1)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const normalizedQuery = query.trim().toLowerCase()

  const suggestions = useMemo(() => {
    if (!open) return []
    if (!normalizedQuery) return options.slice(0, maxSuggestions)
    const filtered = options.filter(o => o.label.toLowerCase().includes(normalizedQuery))
    return filtered.slice(0, maxSuggestions)
  }, [open, normalizedQuery, options, maxSuggestions])

  const commit = (id: string) => {
    onChangeId(id)
    setOpen(false)
    setActiveIndex(-1)
  }

  return (
    <div
      ref={boxRef}
      className={`min-w-[240px] flex-[1_1_240px] ${className}`}
    >
      {/* ✅ Label : même style que “From date proposed” */}
      <div className="text-[14px] font-bold mb-1.5 tracking-[0.02em]">
        {label}
      </div>

      <div className="relative">
        <input
          value={query}
          placeholder={placeholder ?? 'Type to search…'}
          onChange={e => {
            setQuery(e.target.value)
            setOpen(true)
            setActiveIndex(-1)
            // si l’utilisateur modifie, on repasse en "all" jusqu’à sélection
            if (valueId !== 'all') onChangeId('all')
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => {
            if (!open) return

            if (e.key === 'Escape') {
              setOpen(false)
              setActiveIndex(-1)
              return
            }

            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActiveIndex(i => Math.min(i + 1, suggestions.length - 1))
            }

            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActiveIndex(i => Math.max(i - 1, 0))
            }

            if (e.key === 'Enter') {
              if (activeIndex >= 0 && activeIndex < suggestions.length) {
                e.preventDefault()
                commit(suggestions[activeIndex].id)
              }
            }
          }}
          className={`w-full rounded-[10px] border border-black/25 bg-white px-3 py-2.5 pr-14 outline-none focus:ring-2 focus:ring-black/15 ${inputClassName}`}
        />

        {/* bouton reset */}
        <button
          type="button"
          onClick={() => {
            setQuery('')
            commit('all')
          }}
          className="absolute right-2 top-1.5 rounded-lg border border-black/15 bg-white px-2 py-1.5 text-[12px] font-semibold hover:bg-black/5"
          title="Reset"
        >
          {allLabel}
        </button>

        {open && (
          <div
            className={`absolute left-0 right-0 z-20 mt-1.5 max-h-[320px] overflow-y-auto rounded-[10px] border border-black/20 bg-white shadow-[0_12px_30px_rgba(0,0,0,0.15)] ${menuClassName}`}
          >
            {suggestions.length === 0 ? (
              <div className="p-2.5 text-[13px] opacity-70">No results</div>
            ) : (
              suggestions.map((o, idx) => (
                <div
                  key={o.id}
                  onMouseDown={() => commit(o.id)} // important: mouseDown avant blur
                  onMouseEnter={() => setActiveIndex(idx)}
                  className="cursor-pointer border-b border-black/5 px-3 py-2.5 text-[13px] last:border-b-0"
                  style={{
                    background: idx === activeIndex ? '#f2f2f2' : 'transparent',
                  }}
                >
                  {o.label}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
