import type { ResolvePlacement } from '@segnavia/html'
import { safeImageSource } from '@segnavia/html'
import type { IdmlAssetMap } from './types.ts'

export async function idmlAssetFrom(resolve: ResolvePlacement, uris: Iterable<string>, context: Parameters<ResolvePlacement>[1]): Promise<IdmlAssetMap> {
  const entries = await Promise.all(
    [...new Set(uris)].map(async (uri) => {
      const answer = await resolve({ kind: 'media', address: uri }, context)
      return [uri, answer?.kind === 'media' && safeImageSource(answer.src) ? answer.src : undefined] as const
    }),
  )
  const resolved = new Map(entries)
  return (uri) => resolved.get(uri)
}
