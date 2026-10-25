'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

export default function ArtworkPrintToolbar({ children, floating }: { children: ReactNode; floating: boolean }) {
  const toolbar = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState({ top: 72, height: 60 })

  useEffect(() => {
    if (!floating) return
    const header = document.querySelector<HTMLElement>('.app-header')
    const update = () => {
      const top = (header?.getBoundingClientRect().bottom ?? 60) + 8
      const height = (toolbar.current?.getBoundingClientRect().height ?? 52) + 8
      setLayout(previous => previous.top === top && previous.height === height ? previous : { top, height })
    }
    update()
    const observer = new ResizeObserver(update)
    if (header) observer.observe(header)
    if (toolbar.current) observer.observe(toolbar.current)
    return () => observer.disconnect()
  }, [floating])

  return (
    <div className={floating ? 'artwork-print-toolbar-space' : undefined}
      style={floating ? { minHeight: layout.height } : undefined}>
      <div ref={toolbar} className={floating ? 'artwork-print-toolbar-floating' : undefined}
        role="group" aria-label="Artwork status and actions"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 10,
          ...(floating ? { top: layout.top } : {}) }}>
        {children}
      </div>
    </div>
  )
}
