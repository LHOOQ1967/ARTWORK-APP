'use client'

import { useRef, useState } from 'react'

export default function CommissionInvoiceFileInput({
  label,
  file,
  disabled = false,
  onChange,
}: {
  label: string
  file?: File
  disabled?: boolean
  onChange: (file?: File) => void
}) {
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function selectFiles(files: FileList | File[]) {
    if (disabled) return
    if (files.length !== 1) {
      setError('Select only one invoice file at a time.')
      return
    }
    const selected = files[0]
    if (selected.size === 0 || selected.size > 100 * 1024 * 1024) {
      setError(selected.size === 0 ? 'This file is empty.' : 'File too large. Maximum size: 100 MB.')
      return
    }
    setError('')
    onChange(selected)
  }

  return (
    <div className="text-sm">
      <div
        className="inline-flex max-w-full items-center gap-2"
        onDragOver={event => event.preventDefault()}
        onDrop={event => {
          event.preventDefault()
          selectFiles(event.dataTransfer.files)
        }}
      >
        <button
          type="button"
          className="whitespace-nowrap rounded border px-2 py-1"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          Add file invoice
        </button>
        <input
          ref={inputRef}
          aria-label={label}
          type="file"
          disabled={disabled}
          hidden
          onChange={event => {
            if (event.target.files?.length) selectFiles(event.target.files)
            event.target.value = ''
          }}
        />
        {file && (
          <>
            <span className="max-w-32 truncate" title={file.name}>{file.name}</span>
            <button
              type="button"
              aria-label={`Remove selected file ${file.name}`}
              disabled={disabled}
              onClick={() => {
                setError('')
                onChange(undefined)
              }}
            >x</button>
          </>
        )}
      </div>
      {error && <p role="alert" className="text-red-700">{error}</p>}
    </div>
  )
}
