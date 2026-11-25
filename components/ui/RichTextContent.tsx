import type { ReactNode } from 'react'
import { parseRichText, type RichTextNode } from '@/lib/richText'

function renderNodes(nodes: RichTextNode[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`
    if (node.type === 'text') {
      return node.value
    }
    if (node.type === 'link') {
      return <a key={key} href={node.href} target="_blank" rel="noopener noreferrer"
        style={{ color: '#0369a1', textDecoration: 'underline', overflowWrap: 'anywhere' }}>
        {node.label}
      </a>
    }

    const children = renderNodes(node.children, key)
    if (node.type === 'bold') return <strong key={key}>{children}</strong>
    if (node.type === 'italic') return <em key={key}>{children}</em>
    return <u key={key}>{children}</u>
  })
}

export function RichTextContent({ text }: { text: string }) {
  return <>{renderNodes(parseRichText(text), 'rich-text')}</>
}
