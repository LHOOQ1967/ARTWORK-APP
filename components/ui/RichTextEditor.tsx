'use client'

import { useEffect, useRef, type ClipboardEvent } from 'react'
import { richTextFromEditor, richTextToEditorHtml } from '@/lib/richText'
import styles from './RichTextEditor.module.css'

type Props = {
  id?: string
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  maxLength?: number
  minHeight?: number
}

const FORMATS = [
  { command: 'bold', label: 'Bold', symbol: 'B' },
  { command: 'italic', label: 'Italic', symbol: 'I' },
  { command: 'underline', label: 'Underline', symbol: 'U' },
] as const

export default function RichTextEditor({
  id,
  label,
  value,
  onChange,
  disabled = false,
  maxLength,
  minHeight = 120,
}: Props) {
  const editorRef = useRef<HTMLDivElement>(null)
  const lastValueRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || value === lastValueRef.current) return
    editor.innerHTML = richTextToEditorHtml(value)
    lastValueRef.current = value
  }, [value])

  function updateValue() {
    const editor = editorRef.current
    if (!editor) return
    const nextValue = richTextFromEditor(editor)
    if (maxLength !== undefined && nextValue.length > maxLength) {
      editor.innerHTML = richTextToEditorHtml(lastValueRef.current ?? '')
      return
    }
    lastValueRef.current = nextValue
    onChange(nextValue)
  }

  function applyFormat(command: string) {
    editorRef.current?.focus()
    document.execCommand(command)
    updateValue()
  }

  function pastePlainText(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault()
    document.execCommand('insertText', false, event.clipboardData.getData('text/plain'))
    updateValue()
  }

  return <div className={styles.root}>
    {!disabled && <div className={styles.toolbar} role="toolbar" aria-label={`${label} formatting`}>
      {FORMATS.map(format => <button key={format.command} type="button" title={format.label}
        aria-label={format.label} disabled={disabled}
        className={format.command === 'italic' ? styles.italic : format.command === 'underline' ? styles.underline : ''}
        onMouseDown={event => event.preventDefault()}
        onClick={() => applyFormat(format.command)}>
        {format.symbol}
      </button>)}
    </div>}
    <div id={id} ref={editorRef} className={`${styles.editor} ${disabled ? styles.readOnly : ''}`}
      contentEditable={!disabled} role="textbox" aria-label={label} aria-multiline="true"
      aria-readonly={disabled}
      suppressContentEditableWarning onInput={updateValue} onPaste={pastePlainText}
      onDrop={event => event.preventDefault()}
      style={{ minHeight: disabled ? 0 : minHeight }} />
  </div>
}
