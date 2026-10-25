type FileMetadata = {
  file_name?: string | null
  mime_type?: string | null
  label?: string | null
  url?: string | null
}

const MIME_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
  'image/tiff': 'TIF',
  'image/webp': 'WEBP',
  'image/gif': 'GIF',
  'image/heic': 'HEIC',
  'image/heif': 'HEIF',
  'image/svg+xml': 'SVG',
  'application/zip': 'ZIP',
  'application/msword': 'DOC',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.ms-excel': 'XLS',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
}
const EXTENSIONS = new Set([...Object.values(MIME_EXTENSIONS), 'TXT', 'CSV', 'PPT', 'PPTX', 'MP4', 'MOV'])

export function documentFileType(document: FileMetadata): string {
  const fromMime = MIME_EXTENSIONS[document.mime_type?.split(';')[0].trim().toLowerCase() ?? '']
  if (fromMime) return fromMime
  let urlPath = ''
  if (document.url) {
    try {
      urlPath = decodeURIComponent(new URL(document.url, 'https://artmuse.invalid').pathname)
    } catch {
      // External URLs may contain invalid escapes; use the original filename or label instead.
    }
  }
  for (const name of [document.file_name, urlPath, document.label]) {
    const extension = name?.match(/\.([a-z0-9]+)$/i)?.[1].toUpperCase()
    const normalized = extension === 'JPEG' ? 'JPG' : extension === 'TIFF' ? 'TIF' : extension
    if (normalized && EXTENSIONS.has(normalized)) return normalized
  }
  return 'LINK'
}
