import { stdinBoundRefusal } from './protocol.ts'

export async function readRenderInput(input: AsyncIterable<Uint8Array>, limit: number): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  let length = 0
  for await (const chunk of input) {
    length += chunk.byteLength
    if (length > limit) throw stdinBoundRefusal(limit)
    chunks.push(chunk)
  }
  const result = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}
