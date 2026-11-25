import { parseNoteLinks } from '@/lib/noteLinks'

export type RichTextNode =
  | { type: 'text'; value: string }
  | { type: 'bold' | 'italic' | 'underline'; children: RichTextNode[] }
  | { type: 'link'; href: string; label: string }

const FORMAT_PATTERN = /(\*\*[^*\n]+?\*\*|\*[^*\n]+?\*|\+\+[^+\n]+?\+\+)/g

function parsePlainText(value: string): RichTextNode[] {
  return parseNoteLinks(value).map(segment =>
    segment.type === 'link'
      ? { type: 'link', href: segment.href, label: segment.label }
      : { type: 'text', value: segment.value }
  )
}

function parseFormattedText(value: string): RichTextNode[] {
  const nodes: RichTextNode[] = []
  let previousMatchEnd = 0

  for (const match of value.matchAll(FORMAT_PATTERN)) {
    const start = match.index ?? 0
    if (start > previousMatchEnd) {
      nodes.push(...parsePlainText(value.slice(previousMatchEnd, start)))
    }

    const token = match[0]
    const isDoubleMarker = token.startsWith('**') || token.startsWith('++')
    const markerLength = isDoubleMarker ? 2 : 1
    const marker = token.slice(0, markerLength)
    const type = marker === '**' ? 'bold' : marker === '*' ? 'italic' : 'underline'
    nodes.push({
      type,
      children: parseFormattedText(token.slice(markerLength, -markerLength)),
    })
    previousMatchEnd = start + token.length
  }

  if (previousMatchEnd < value.length) {
    nodes.push(...parsePlainText(value.slice(previousMatchEnd)))
  }

  return nodes
}

export function parseRichText(value: string): RichTextNode[] {
  return parseFormattedText(value)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function nodesToEditorHtml(nodes: RichTextNode[]): string {
  return nodes.map(node => {
    if (node.type === 'text') {
      return escapeHtml(node.value).replace(/\n/g, '<br>')
    }
    if (node.type === 'link') {
      const label = escapeHtml(node.label)
      const href = escapeHtml(node.href)
      return `<a href="${href}">${label}</a>`
    }

    const tag = node.type === 'bold' ? 'strong' : node.type === 'italic' ? 'em' : 'u'
    return `<${tag}>${nodesToEditorHtml(node.children)}</${tag}>`
  }).join('')
}

export function richTextToEditorHtml(value: string): string {
  return nodesToEditorHtml(parseRichText(value))
}

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? ''
  if (!(node instanceof HTMLElement)) return ''

  const tag = node.tagName
  if (tag === 'BR') return '\n'

  const content = [...node.childNodes].map(serializeNode).join('')
  if (tag === 'STRONG' || tag === 'B') return content ? `**${content}**` : ''
  if (tag === 'EM' || tag === 'I') return content ? `*${content}*` : ''
  if (tag === 'U') return content ? `++${content}++` : ''
  if (tag === 'A') {
    const href = node.getAttribute('href') ?? ''
    if (!href.startsWith('https://')) return content
    return href === content ? href : `[${content}](${href})`
  }
  if (tag === 'DIV' || tag === 'P') return `${content}\n`
  return content
}

export function richTextFromEditor(element: HTMLElement): string {
  return [...element.childNodes].map(serializeNode).join('').replace(/\n+$/, '')
}
