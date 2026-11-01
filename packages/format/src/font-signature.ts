import type { FontFormat } from './fonts.ts'

export const COLLECTION_TAG = 'ttcf'

export function classifyFont(bytes: Uint8Array, offset = 0): FontFormat | undefined {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > bytes.length - 4) return
  const tag = String.fromCharCode(bytes[offset] ?? 0, bytes[offset + 1] ?? 0, bytes[offset + 2] ?? 0, bytes[offset + 3] ?? 0)
  if (tag === 'wOF2') return 'woff2'
  if (tag === 'wOFF') return 'woff'
  if (tag === 'OTTO') return 'opentype'
  if (tag === COLLECTION_TAG) return 'collection'
  if (tag === 'true' || tag === '\u0000\u0001\u0000\u0000') return 'truetype'
}
