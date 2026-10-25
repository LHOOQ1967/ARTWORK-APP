import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'
import { storedArtworkThumbnail, ThumbnailError } from '@/lib/artworkThumbnails'
import { scheduleThumbnailCleanup } from '@/lib/scheduleThumbnailCleanup'

export const runtime = 'nodejs'

const bucketName = 'artwork-images'

export async function GET(request: NextRequest) {
  const authorization = await requireUser(request)
  if (authorization.response) return authorization.response

  const sourceUrl = request.nextUrl.searchParams.get('url')
  if (!sourceUrl) {
    return NextResponse.json({ error: 'Missing image URL' }, { status: 400 })
  }

  let source: URL
  try {
    source = new URL(sourceUrl)
  } catch {
    return NextResponse.json({ error: 'Invalid image URL' }, { status: 400 })
  }

  const expectedOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin
  const publicPrefix = `/storage/v1/object/public/${bucketName}/`
  if (source.origin !== expectedOrigin || !source.pathname.startsWith(publicPrefix)) {
    return NextResponse.json({ error: 'Invalid image source' }, { status: 400 })
  }

  let filePath: string
  try {
    filePath = decodeURIComponent(source.pathname.slice(publicPrefix.length))
  } catch {
    return NextResponse.json({ error: 'Invalid image path' }, { status: 400 })
  }
  if (!filePath) {
    return NextResponse.json({ error: 'Missing image path' }, { status: 400 })
  }

  if (request.nextUrl.searchParams.get('thumbnail') === '1') {
    scheduleThumbnailCleanup()
    try {
      const { bytes } = await storedArtworkThumbnail(authorization.supabase, sourceUrl, filePath)
      return new NextResponse(bytes, {
        headers: {
          'Content-Type': 'image/webp',
          'Content-Length': String(bytes.length),
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    } catch (cause) {
      console.error('ARTWORK THUMBNAIL ERROR:', cause)
      return NextResponse.json(
        { error: cause instanceof ThumbnailError ? cause.message : 'Unable to serve image thumbnail' },
        { status: cause instanceof ThumbnailError ? cause.status : 502 },
      )
    }
  }

  const { data, error } = await authorization.supabase.storage
    .from(bucketName)
    .createSignedUrl(filePath, 60)

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'Image unavailable' }, { status: 404 })
  }

  return NextResponse.redirect(data.signedUrl, 302)
}