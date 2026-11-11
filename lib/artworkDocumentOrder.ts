import { DOCUMENT_CATEGORIES, type DocumentCategory } from '@/lib/documentCategory'

type OrderedArtworkDocument = {
  label?: string | null
  link_category?: DocumentCategory
  position?: number | null
}

const GENERAL_DOCUMENT_ORDER: readonly string[][] = [
  ['ficheblondeau'],
  ['facturedachat', 'facture'],
  ['facturecommission'],
  ['resultatventes'],
  ['certificat'],
  ['rapportdeconditionheritier', 'raportdeconditionheritier', 'conditionreportheritier'],
] as const

const ALWAYS_LAST_GENERAL_LABELS = new Set(['dossieronedrive'])

function normalizedLabel(label: string | null | undefined) {
  return (label ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s’']/g, '')
}

function generalLabelOrder(label: string | null | undefined) {
  const normalized = normalizedLabel(label)
  const fixedIndex = GENERAL_DOCUMENT_ORDER.findIndex(labels => labels.includes(normalized))
  if (fixedIndex !== -1) return { group: 0, order: fixedIndex }
  if (ALWAYS_LAST_GENERAL_LABELS.has(normalized)) return { group: 2, order: 0 }
  return { group: 1, order: 0 }
}

export function isFixedGeneralDocumentLabel(label: string | null | undefined) {
  const normalized = normalizedLabel(label)
  return GENERAL_DOCUMENT_ORDER.some(labels => labels.includes(normalized)) ||
    ALWAYS_LAST_GENERAL_LABELS.has(normalized)
}

export function isHeirConditionReportDocumentLabel(label: string | null | undefined) {
  const normalized = normalizedLabel(label)
  return GENERAL_DOCUMENT_ORDER[5].includes(normalized)
}

export function canReorderArtworkDocument(document: OrderedArtworkDocument) {
  return (document.link_category ?? 'general') !== 'general' ||
    !isFixedGeneralDocumentLabel(document.label)
}

export function sortArtworkDocuments<T extends OrderedArtworkDocument>(documents: T[]) {
  const categoryOrder = new Map(DOCUMENT_CATEGORIES.map((category, index) => [category, index]))
  return documents
    .map((document, index) => ({ document, index }))
    .sort((a, b) => {
      const aCategory = a.document.link_category ?? 'general'
      const bCategory = b.document.link_category ?? 'general'
      const categoryDifference = (categoryOrder.get(aCategory) ?? 0) - (categoryOrder.get(bCategory) ?? 0)
      if (categoryDifference !== 0) return categoryDifference

      if (aCategory === 'general') {
        const aOrder = generalLabelOrder(a.document.label)
        const bOrder = generalLabelOrder(b.document.label)
        if (aOrder.group !== bOrder.group) return aOrder.group - bOrder.group
        if (aOrder.order !== bOrder.order) return aOrder.order - bOrder.order
      }

      const aPosition = typeof a.document.position === 'number' ? a.document.position : 9999
      const bPosition = typeof b.document.position === 'number' ? b.document.position : 9999
      return aPosition - bPosition || a.index - b.index
    })
    .map(({ document }) => document)
}
