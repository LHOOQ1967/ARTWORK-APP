export async function fetchAuctionBytes(url: string, kind: 'page' | 'image', house: string, validate: (url: string) => string): Promise<Uint8Array> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  const maxBytes = kind === 'page' ? 5 * 1024 * 1024 : 15 * 1024 * 1024
  try {
    let target = validate(url)
    for (let redirects = 0; redirects <= 3; redirects++) {
      const response = await fetch(target, {
        redirect: 'manual', signal: controller.signal, cache: 'no-store',
        headers: { Accept: kind === 'page' ? 'text/html' : 'image/*' },
      })
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel()
        const location = response.headers.get('location')
        if (!location) throw new Error(`${house} returned a redirect without a destination.`)
        target = validate(new URL(location, target).toString())
        continue
      }
      if (!response.ok) {
        await response.body?.cancel()
        throw new Error(`${house} ${kind} request failed (HTTP ${response.status}).`)
      }
      const mime = response.headers.get('content-type')?.split(';')[0]
      if (kind === 'page' ? mime !== 'text/html' : !mime?.startsWith('image/')) {
        await response.body?.cancel()
        throw new Error(`${house} did not return a valid ${kind}.`)
      }
      if (Number(response.headers.get('content-length')) > maxBytes) {
        await response.body?.cancel()
        throw new Error(`The ${house} ${kind} exceeds the download size limit.`)
      }
      if (!response.body) throw new Error(`${house} returned an empty ${kind}.`)
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let size = 0
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          size += value.byteLength
          if (size > maxBytes) throw new Error(`The ${house} ${kind} exceeds the download size limit.`)
          chunks.push(value)
        }
      } finally {
        await reader.cancel()
      }
      if (!size) throw new Error(`${house} returned an empty ${kind}.`)
      const bytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
      return bytes
    }
    throw new Error(`${house} returned too many redirects.`)
  } finally {
    clearTimeout(timeout)
  }
}
