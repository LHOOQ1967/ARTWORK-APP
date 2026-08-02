import { describe, expect, it } from 'vitest';
import { parseNoteLinks } from '@/lib/noteLinks';

describe('parseNoteLinks', () => {
  it('turns a direct HTTPS URL into a link', () => {
    expect(parseNoteLinks('Dossier : https://example.com/folder?id=42')).toEqual([
      { type: 'text', value: 'Dossier : ' },
      { type: 'link', label: 'https://example.com/folder?id=42', href: 'https://example.com/folder?id=42' },
    ]);
  });

  it('turns a Markdown link into a link even when split across lines', () => {
    expect(parseNoteLinks('[Ouvrir le dossier]\n(https://example.com/folder)')).toEqual([
      { type: 'link', label: 'Ouvrir le dossier', href: 'https://example.com/folder' },
    ]);
  });

  it('keeps plain text unchanged', () => {
    expect(parseNoteLinks('Note interne sans lien')).toEqual([
      { type: 'text', value: 'Note interne sans lien' },
    ]);
  });
});
