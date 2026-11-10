import { expect, test } from 'bun:test'
import { PDFDocument } from 'pdf-lib'
import { buildPressProfile } from '../color/profile-fixture.test-helper.ts'
import { RenderColorProfileError, RenderRefusedError } from '../errors.ts'
import { rewritePressPdf } from './adapter.ts'

const profile = buildPressProfile('mft1')

function rgbProfile(): Uint8Array {
  const bytes = profile.slice()
  bytes.set(new TextEncoder().encode('RGB '), 16)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let index = 0; index < view.getUint32(128, false); index++) {
    const record = 132 + index * 12
    const name = new TextDecoder().decode(bytes.subarray(record, record + 4))
    const offset = view.getUint32(record + 4, false)
    if (name.startsWith('A2B')) bytes[offset + 8] = 3
    if (name.startsWith('B2A')) bytes[offset + 9] = 3
  }
  return bytes
}

test('refuses a non-CMYK press profile', async () => {
  const document = await PDFDocument.create()
  document.addPage()
  try {
    await rewritePressPdf(await document.save(), rgbProfile())
    throw new Error('Expected the press profile to be refused')
  } catch (error) {
    expect(error).toBeInstanceOf(RenderColorProfileError)
    expect(error).toMatchObject({ profile: 'press', found: 'color space RGB', supported: 'CMYK or GRAY' })
    expect((error as Error).message).toBe(
      'The press profile has unsupported color space RGB; supported: CMYK or GRAY. Supply a valid ICC output profile to clear this refusal.',
    )
  }
})

test.each([
  ['truncated', Uint8Array.of(), 'truncated profile tag'],
  [
    'wrong-version',
    (() => {
      const bytes = profile.slice()
      bytes[8] = 3
      bytes[9] = 0
      return bytes
    })(),
    'ICC version 3.0',
  ],
] as const)('reports a %s press profile as a structured color-profile refusal', async (_name, bytes, found) => {
  const document = await PDFDocument.create()
  document.addPage()
  try {
    await rewritePressPdf(await document.save(), bytes)
    throw new Error('Expected the press profile to be refused')
  } catch (error) {
    expect(error).toBeInstanceOf(RenderColorProfileError)
    expect(error).toBeInstanceOf(RenderRefusedError)
    expect(error).toMatchObject({ profile: 'press', found })
  }
})

test('keeps a broken PDF distinct from a color-profile refusal', async () => {
  try {
    await rewritePressPdf(Uint8Array.of(), profile)
    throw new Error('Expected the PDF to be refused')
  } catch (error) {
    expect(error).toBeInstanceOf(RenderRefusedError)
    expect(error).not.toBeInstanceOf(RenderColorProfileError)
    expect((error as Error).message).toContain('malformed structure')
  }
})
