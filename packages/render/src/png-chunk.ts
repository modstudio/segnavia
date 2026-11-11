import { crc32 } from './crc32.ts'

export function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const name = new TextEncoder().encode(type)
  const output = new Uint8Array(data.length + 12)
  const view = new DataView(output.buffer)
  view.setUint32(0, data.length)
  output.set(name, 4)
  output.set(data, 8)
  view.setUint32(output.length - 4, crc32(output.subarray(4, output.length - 4)))
  return output
}
