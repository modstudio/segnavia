import { inflateSync } from 'node:zlib'

export function screenshotPixel(png: Uint8Array): [number, number, number] {
  let offset = 8
  const compressed: Uint8Array[] = []
  while (offset < png.length) {
    const length = new DataView(png.buffer, png.byteOffset + offset, 4).getUint32(0)
    const type = new TextDecoder().decode(png.subarray(offset + 4, offset + 8))
    if (type === 'IDAT') compressed.push(png.subarray(offset + 8, offset + 8 + length))
    offset += length + 12
  }
  const row = inflateSync(Buffer.concat(compressed))
  return [row[1] ?? 0, row[2] ?? 0, row[3] ?? 0]
}

export async function waitForScreenshotPixel(
  screenshot: () => Promise<Uint8Array>,
  expected: readonly [number, number, number],
  timeoutMs = 5000,
): Promise<[number, number, number]> {
  const deadline = performance.now() + timeoutMs
  let pixel: [number, number, number] = [0, 0, 0]
  do {
    pixel = screenshotPixel(await screenshot())
    if (pixel.every((channel, index) => channel === expected[index])) return pixel
    await new Promise((resolve) => setTimeout(resolve, 16))
  } while (performance.now() < deadline)
  return pixel
}
