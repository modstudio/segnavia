import { classifyMediaAnswer, type ResolvePlacement } from '@segnavia/html'
import type { IdmlAssetMap } from './types.ts'

function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

export async function idmlAssetFrom<R extends { kind: string }>(
  resolve: ResolvePlacement<R>,
  uris: Iterable<string>,
  context: Parameters<ResolvePlacement<R>>[1],
): Promise<IdmlAssetMap> {
  const entries = await Promise.all(
    [...new Set(uris)].map(async (uri) => {
      const answer = await resolve({ kind: 'media', address: uri }, context)
      const classified = classifyMediaAnswer({ answer })
      if (classified.status !== 'ok') return [uri, undefined] as const
      const alt = classified.value.media.alt?.text ?? ''
      return [uri, `<img src="${escapeAttribute(classified.value.src)}" alt="${escapeAttribute(alt)}">`] as const
    }),
  )
  const resolved = new Map(entries)
  return (uri) => resolved.get(uri)
}
