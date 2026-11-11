import { describe, expect, it } from 'vitest'
import {
  canReorderArtworkDocument,
  isFixedGeneralDocumentLabel,
  isHeirConditionReportDocumentLabel,
  sortArtworkDocuments,
} from '@/lib/artworkDocumentOrder'

describe('factsheet general document ordering', () => {
  it('recognizes the fixed general labels and OneDrive folder name', () => {
    for (const label of [
      'Fiche Blondeau',
      "Facture d'achat",
      'Facture',
      'Facture Commission',
      'Résultat ventes',
      'Certificat',
      'Raport de condition Héritier',
      'Rapport de condition Héritier',
      'Condition Report Héritier',
      'Dossier One Drive',
    ]) {
      expect(isFixedGeneralDocumentLabel(label)).toBe(true)
      expect(canReorderArtworkDocument({ label, link_category: 'general' })).toBe(false)
    }
  })

  it('allows manual general links and links in other categories to be reordered', () => {
    expect(canReorderArtworkDocument({ label: 'My link', link_category: 'general' })).toBe(true)
    expect(canReorderArtworkDocument({ label: 'Certificate', link_category: 'images' })).toBe(true)
  })

  it('recognizes the heir condition report label variants for its factsheet row', () => {
    for (const label of [
      'Raport de condition Héritier',
      'Rapport de condition Héritier',
      'Condition Report Héritier',
    ]) {
      expect(isHeirConditionReportDocumentLabel(label)).toBe(true)
    }
  })

  it('sorts fixed labels, manual links by stored position and the OneDrive folder last', () => {
    const documents = [
      { label: 'Dossier One Drive', position: 0 },
      { label: 'Second manual link', position: 8 },
      { label: 'Certificat', position: 2 },
      { label: 'Résultat ventes', position: 9 },
      { label: 'First manual link', position: 7 },
      { label: 'Facture', position: 6 },
      { label: 'Fiche Blondeau', position: 5 },
      { label: 'Facture Commission', position: 4 },
      { label: 'Condition Report Héritier', position: 3 },
    ]

    expect(sortArtworkDocuments(documents).map(document => document.label)).toEqual([
      'Fiche Blondeau',
      'Facture',
      'Facture Commission',
      'Résultat ventes',
      'Certificat',
      'Condition Report Héritier',
      'First manual link',
      'Second manual link',
      'Dossier One Drive',
    ])
  })
})
