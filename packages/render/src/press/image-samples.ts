export function indexedSamples(source: Uint8Array, width: number, height: number, bits: number): Uint8Array {
  const rowBytes = Math.ceil((width * bits) / 8)
  const output = new Uint8Array(width * height)
  const mask = 2 ** bits - 1
  for (let row = 0; row < height; row++)
    for (let column = 0; column < width; column++) {
      const bit = column * bits
      output[row * width + column] = ((source[row * rowBytes + Math.floor(bit / 8)] ?? 0) >> (8 - bits - (bit % 8))) & mask
    }
  return output
}

// PNG predictor rows include one filter byte; filter zero keeps re-encoding lossless and bounded.
export function pngPredictor(source: Uint8Array, width: number, height: number, channels: number, bits = 8): Uint8Array {
  const rowBytes = Math.ceil((width * channels * bits) / 8)
  const output = new Uint8Array(source.length + height)
  for (let row = 0; row < height; row++) output.set(source.subarray(row * rowBytes, (row + 1) * rowBytes), row * (rowBytes + 1) + 1)
  return output
}
