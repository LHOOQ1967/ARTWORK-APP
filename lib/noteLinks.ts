export type NoteSegment =
  | { type: 'text'; value: string }
  | { type: 'link'; label: string; href: string };

const NOTE_LINK_PATTERN = /\[([^\]]+)\]\s*\((https:\/\/[^\s)]+)\)|(https:\/\/[^\s<]+)/g;

export function parseNoteLinks(note: string): NoteSegment[] {
  const segments: NoteSegment[] = [];
  let previousMatchEnd = 0;

  for (const match of note.matchAll(NOTE_LINK_PATTERN)) {
    const matchStart = match.index ?? 0;
    const href = match[2] ?? match[3];

    if (!href) {
      continue;
    }

    if (matchStart > previousMatchEnd) {
      segments.push({ type: 'text', value: note.slice(previousMatchEnd, matchStart) });
    }

    segments.push({
      type: 'link',
      label: match[1] ?? href,
      href,
    });
    previousMatchEnd = matchStart + match[0].length;
  }

  if (previousMatchEnd < note.length) {
    segments.push({ type: 'text', value: note.slice(previousMatchEnd) });
  }

  return segments;
}
