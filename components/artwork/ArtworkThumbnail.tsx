'use client'

import { useState } from 'react'
import { privateImageUrl } from '@/lib/privateImageUrl'

export default function ArtworkThumbnail({ url }: { url: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  if (failedUrl === url) {
    return <span role="img" aria-label="Image unavailable"
      style={{ display: 'inline-block', width: 80, minHeight: 70, fontSize: 12 }}>
      Image unavailable
    </span>
  }
  return <img src={privateImageUrl(url, true)} alt="" width={80} height={70}
    loading="lazy" decoding="async" onError={() => setFailedUrl(url)}
    style={{ width: 80, height: 70, objectFit: 'cover', borderRadius: 4, display: 'block' }} />
}
