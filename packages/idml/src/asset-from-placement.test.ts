import { expect, test } from 'bun:test'
import type { Media } from '@segnavia/format'
import { idmlAssetFrom } from './asset-from-placement.ts'

test('idmlAssetFrom resolves each supplied URI once into a synchronous asset map', async () => {
  const media: Media = { format: 'svg', size: { width: 40, height: 20 } }
  const calls: unknown[] = []
  const signal = new AbortController().signal
  const map = await idmlAssetFrom(
    async (placement, context) => {
      calls.push({ placement, context })
      return placement.address === 'held.ai' ? { kind: 'media', media, src: 'data:image/svg+xml,%3Csvg/%3E' } : undefined
    },
    ['held.ai', 'held.ai', 'missing.ai'],
    { purpose: 'print', width: 600, signal },
  )
  expect(map('held.ai')).toBe('data:image/svg+xml,%3Csvg/%3E')
  expect(map('missing.ai')).toBeUndefined()
  expect(calls).toEqual([
    { placement: { kind: 'media', address: 'held.ai' }, context: { purpose: 'print', width: 600, signal } },
    { placement: { kind: 'media', address: 'missing.ai' }, context: { purpose: 'print', width: 600, signal } },
  ])
})
