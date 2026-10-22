// 16-bit PCM mono WAV of a 440 Hz sine. Amplitude is 1/8 of full scale, matching
// lavfi sine, so the demo's recorded-audio slide lasts the given duration.

const SAMPLE_RATE = 44100
const FREQUENCY = 440
const AMPLITUDE = 32767 / 8
const CHANNELS = 1
const BYTES_PER_SAMPLE = 2
const HEADER_BYTES = 44

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
  for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i)
}

export function sineWav(seconds: number): Uint8Array {
  const sampleCount = Math.round(seconds * SAMPLE_RATE)
  const dataBytes = sampleCount * CHANNELS * BYTES_PER_SAMPLE
  const bytes = new Uint8Array(HEADER_BYTES + dataBytes)
  const view = new DataView(bytes.buffer)
  writeAscii(bytes, 0, 'RIFF')
  view.setUint32(4, HEADER_BYTES - 8 + dataBytes, true)
  writeAscii(bytes, 8, 'WAVE')
  writeAscii(bytes, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, CHANNELS, true)
  view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE, true)
  view.setUint16(32, CHANNELS * BYTES_PER_SAMPLE, true)
  view.setUint16(34, 16, true)
  writeAscii(bytes, 36, 'data')
  view.setUint32(40, dataBytes, true)
  const omega = (2 * Math.PI * FREQUENCY) / SAMPLE_RATE
  for (let i = 0; i < sampleCount; i++) view.setInt16(HEADER_BYTES + i * BYTES_PER_SAMPLE, Math.round(Math.sin(omega * i) * AMPLITUDE) || 0, true)
  return bytes
}
