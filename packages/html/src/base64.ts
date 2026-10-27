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

export function base64ToBytes(value: string): Uint8Array | undefined {
  if (value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  const bytes = new Uint8Array((value.length / 4) * 3 - padding)
  let output = 0
  for (let index = 0; index < value.length; index += 4) {
    const a = TABLE.indexOf(value[index] ?? '')
    const b = TABLE.indexOf(value[index + 1] ?? '')
    const c = value[index + 2] === '=' ? 0 : TABLE.indexOf(value[index + 2] ?? '')
    const d = value[index + 3] === '=' ? 0 : TABLE.indexOf(value[index + 3] ?? '')
    const triplet = (a << 18) | (b << 12) | (c << 6) | d
    if (output < bytes.length) bytes[output++] = (triplet >> 16) & 255
    if (output < bytes.length) bytes[output++] = (triplet >> 8) & 255
    if (output < bytes.length) bytes[output++] = triplet & 255
  }
  return bytes
}
