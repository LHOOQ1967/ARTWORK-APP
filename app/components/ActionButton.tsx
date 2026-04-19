
'use client'

import React from 'react'

export function ActionButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        backgroundColor: '#f3f3f3',
        border: '1px solid #ccc',
        borderRadius: 4,
        padding: '6px 12px',
        fontSize: '0.9rem',
        cursor: disabled ? 'not-allowed' : 'pointer',
        color: '#333',
        opacity: disabled ? 0.6 : 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.backgroundColor = '#e9e9e9'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = '#f3f3f3'
      }}
      onFocus={(e) => {
        e.currentTarget.style.boxShadow = '0 0 0 2px #ddd'
      }}
      onBlur={(e) => {
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      {children}
    </button>
  )
}
