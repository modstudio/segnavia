const TABLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function triplet(data: Uint8Array, index: number, count: number): number {
  let value = 0
  for (let offset = 0; offset < 3; offset += 1) {
    const byte = offset < count ? data[index + offset] : 0
    value = (value << 8) | (byte ?? 0)
  }
  return value
}

function encodeTriplet(value: number, chars: number): string {
  const shifts = [18, 12, 6, 0]
  let out = ''
  for (let i = 0; i < 4; i += 1) {
    const shift = shifts[i] ?? 0
    out += i < chars ? (TABLE[(value >> shift) & 63] ?? '') : '='
  }
  return out
}

export function bytesToBase64(data: Uint8Array): string {
  let out = ''
  const full = Math.floor(data.length / 3) * 3
  for (let i = 0; i < full; i += 3) out += encodeTriplet(triplet(data, i, 3), 4)
  const rest = data.length - full
  if (rest > 0) out += encodeTriplet(triplet(data, full, rest), rest + 1)
  return out
}
