import { parseNoteLinks } from '@/lib/noteLinks';

type LinkedTextProps = {
  text: string;
};

export function LinkedText({ text }: LinkedTextProps) {
  return parseNoteLinks(text).map((segment, index) =>
    segment.type === 'link' ? (
      <a
        key={`${segment.href}-${index}`}
        href={segment.href}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: '#0369a1', textDecoration: 'underline', overflowWrap: 'anywhere' }}
      >
        {segment.label}
      </a>
    ) : (
      segment.value
    )
  );
}
