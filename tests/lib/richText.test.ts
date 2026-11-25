// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { richTextFromEditor, richTextToEditorHtml } from '@/lib/richText'

describe('rich text conversion', () => {
  it('escapes existing text and only emits supported formatting tags', () => {
    expect(richTextToEditorHtml('<img src=x onerror=alert(1)> **bold**'))
      .toBe('&lt;img src=x onerror=alert(1)&gt; <strong>bold</strong>')
  })

  it('serializes formatting and line breaks while discarding unsupported markup', () => {
    const editor = document.createElement('div')
    editor.innerHTML = '<strong>bold</strong><br><span>plain</span><img src=x>'
    expect(richTextFromEditor(editor)).toBe('**bold**\nplain')
  })
})
