import { after } from 'next/server'
import { cleanArtworkThumbnails } from './artworkThumbnails'
import { storedArtworkThumbnail } from './artworkThumbnails'
import type { SupabaseClient } from '@supabase/supabase-js'

export function scheduleThumbnailCleanup() {
  after(async () => {
    try {
      await cleanArtworkThumbnails()
    } catch (cause) {
      // Queue entries remain durable and are retried on later image requests.
      console.error('ARTWORK THUMBNAIL CLEANUP ERROR:', cause)
    }

  })
}

export function scheduleThumbnailGeneration(client: SupabaseClient, sourceUrl: string, uploadedSource?: Blob) {
  after(async () => {
    try {
      const source = new URL(sourceUrl)
      const prefix = '/storage/v1/object/public/artwork-images/'
      if (source.origin !== new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin ||
        !source.pathname.startsWith(prefix)) return
      const path = decodeURIComponent(source.pathname.slice(prefix.length))
      await storedArtworkThumbnail(client, sourceUrl, path, uploadedSource)
    } catch (cause) {
      console.error('ARTWORK THUMBNAIL PREGENERATION ERROR; RETRY ON DISPLAY:', cause)
    }
  })
}
