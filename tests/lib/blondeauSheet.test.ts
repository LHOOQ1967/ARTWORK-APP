import { describe, expect, it } from 'vitest'
import { findArtworkImageBounds, parseBlondeauSheetText } from '@/lib/blondeauSheet'

describe('parseBlondeauSheetText', () => {
  it('extracts labeled descriptive fields and maps one year to the end year', () => {
    expect(parseBlondeauSheetText([
      'Titre: Portrait de Paul Alexandre',
      'Médium: Huile sur toile',
      'Signature: Signé en bas à droite',
      'Date: 1915',
      'Édition: 2/8',
    ].join('\n'))).toEqual({
      title: 'Portrait de Paul Alexandre',
      medium: 'Huile sur toile',
      signature: 'Signé en bas à droite',
      edition: '2/8',
      year_execution: 1915,
      year_execution_start: null,
      height_cm: null,
      width_cm: null,
      depth_cm: null,
    })
  })

  it('reads values on the line after their labels and supports date ranges', () => {
    expect(parseBlondeauSheetText([
      'TITLE',
      'Portrait of Paul Alexandre',
      'TECHNIQUE',
      'Oil on canvas',
      'SIGNED',
      'Signed lower right',
      'DATED',
      '1913-1915',
      'EDITION',
      '3/10',
    ].join('\n'))).toEqual({
      title: 'Portrait of Paul Alexandre',
      medium: 'Oil on canvas',
      signature: 'Signed lower right',
      edition: '3/10',
      year_execution: 1915,
      year_execution_start: 1913,
      height_cm: null,
      width_cm: null,
      depth_cm: null,
    })
  })

  it('extracts Blondeau catalogue text without explicit field labels', () => {
    expect(parseBlondeauSheetText([
      'AMEDEO MODIGLIANI (Livourne 1884 - Paris 1920)',
      'Portrait de Paul Alexandre',
      'Oil on canvas',
      'Signed lower right',
      '92 x 60 cm. 36.2 x 23.6 in.',
      'Executed in 1911-12',
      'Provenance',
    ].join('\n'))).toEqual({
      title: 'Portrait de Paul Alexandre',
      medium: 'Oil on canvas',
      signature: 'Signed lower right',
      edition: null,
      year_execution: 1912,
      year_execution_start: 1911,
      height_cm: 92,
      width_cm: 60,
      depth_cm: null,
    })
  })

  it('does not consume another field label as a value', () => {
    expect(parseBlondeauSheetText('Titre\nTechnique: Huile\nDate: 1905')).toEqual({
      title: null,
      medium: 'Huile',
      signature: null,
      edition: null,
      year_execution: 1905,
      year_execution_start: null,
      height_cm: null,
      width_cm: null,
      depth_cm: null,
    })
  })

  it('returns null for fields that are not found', () => {
    expect(parseBlondeauSheetText('Unrecognized catalog text')).toEqual({
      title: null,
      medium: null,
      signature: null,
      edition: null,
      year_execution: null,
      year_execution_start: null,
      height_cm: null,
      width_cm: null,
      depth_cm: null,
    })
  })

  it('extracts two- and three-dimensional metric measurements with decimal commas', () => {
    expect(parseBlondeauSheetText('Dimensions: 40,5 x 30 x 2 cm (15.9 x 11.8 in.)')).toMatchObject({
      height_cm: 40.5,
      width_cm: 30,
      depth_cm: 2,
    })
    expect(parseBlondeauSheetText('50 cm x 40 cm')).toMatchObject({
      height_cm: 50,
      width_cm: 40,
      depth_cm: null,
    })
    expect(parseBlondeauSheetText('20 x 15 in.')).toMatchObject({
      height_cm: null,
      width_cm: null,
      depth_cm: null,
    })
  })

  it('finds the large image region near the top of a PDF page', () => {
    const width = 100
    const height = 160
    const pixels = new Uint8ClampedArray(width * height * 4)
    for (let offset = 0; offset < pixels.length; offset += 4) {
      pixels[offset] = 255
      pixels[offset + 1] = 255
      pixels[offset + 2] = 255
      pixels[offset + 3] = 255
    }
    for (let y = 20; y < 110; y += 1) {
      for (let x = 20; x < 76; x += 1) {
        const offset = (y * width + x) * 4
        pixels[offset] = 40
        pixels[offset + 1] = 75
        pixels[offset + 2] = 90
      }
    }

    const bounds = findArtworkImageBounds(width, height, pixels)
    expect(bounds).not.toBeNull()
    expect(bounds?.x).toBeLessThanOrEqual(20)
    expect(bounds?.y).toBeLessThanOrEqual(20)
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeGreaterThanOrEqual(76)
    expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeGreaterThanOrEqual(110)
  })

  it('does not mistake a text-only PDF page for an artwork image', () => {
    const width = 100
    const height = 160
    const pixels = new Uint8ClampedArray(width * height * 4)
    for (let offset = 0; offset < pixels.length; offset += 4) {
      pixels[offset] = 255
      pixels[offset + 1] = 255
      pixels[offset + 2] = 255
      pixels[offset + 3] = 255
    }
    for (let y = 20; y < 30; y += 1) {
      for (let x = 20; x < 35; x += 1) {
        const offset = (y * width + x) * 4
        pixels[offset] = 0
        pixels[offset + 1] = 0
        pixels[offset + 2] = 0
      }
    }
    expect(findArtworkImageBounds(width, height, pixels)).toBeNull()
  })
})
