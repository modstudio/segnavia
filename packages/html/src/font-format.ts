import { classifyFont, type FontFormat } from '@segnavia/format'

export function fontFormat(data: Uint8Array): FontFormat | undefined {
  return classifyFont(data)
}
