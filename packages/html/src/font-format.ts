import type { FontFormat } from '@segnavia/format'

export function fontFormat(data: Uint8Array): FontFormat | undefined {
  if (data.length < 4) return
  const tag = String.fromCharCode(data[0] ?? 0, data[1] ?? 0, data[2] ?? 0, data[3] ?? 0)
  if (tag === 'wOF2') return 'woff2'
  if (tag === 'wOFF') return 'woff'
  if (tag === 'OTTO') return 'opentype'
  if (tag === 'true' || (data[0] === 0 && data[1] === 1 && data[2] === 0 && data[3] === 0)) return 'truetype'
}
