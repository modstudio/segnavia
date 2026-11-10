import { expect, test } from 'bun:test'
import type { Page as Tab } from 'playwright-core'
import { buildPressProfile } from './color/profile-fixture.test-helper.ts'
import { RenderColorProfileError, RenderRefusedError } from './errors.ts'
import { MAX_PROOF_IMAGE_BYTES, MAX_PROOF_IMAGE_PIXELS, proofCapturedImage, proofCaptureOptions, proofRasterImage } from './proof-image.ts'

const unusedTab = {} as Tab
const pngSignature = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)

test('image proof gives a malformed profile engine facts in a structured refusal', async () => {
  try {
    await proofRasterImage(unusedTab, Uint8Array.of(), { profile: Uint8Array.of() })
    throw new Error('Expected the proof profile to be refused')
  } catch (error) {
    expect(error).toBeInstanceOf(RenderColorProfileError)
    expect(error).toBeInstanceOf(RenderRefusedError)
    expect(error).toMatchObject({ profile: 'proof', found: 'truncated profile tag', supported: 'profile tag structure contained within its declared size' })
  }
})

test('image proof gives an RGB monitor profile class and color space in a structured refusal', async () => {
  const profile = buildPressProfile('mft1')
  profile.set(new TextEncoder().encode('mntr'), 12)
  profile.set(new TextEncoder().encode('RGB '), 16)
  const view = new DataView(profile.buffer, profile.byteOffset, profile.byteLength)
  for (let index = 0; index < view.getUint32(128, false); index++) {
    const record = 132 + index * 12
    const name = new TextDecoder().decode(profile.subarray(record, record + 4))
    const offset = view.getUint32(record + 4, false)
    if (name.startsWith('A2B')) profile[offset + 8] = 3
    if (name.startsWith('B2A')) profile[offset + 9] = 3
  }
  try {
    await proofRasterImage(unusedTab, Uint8Array.of(), { profile })
    throw new Error('Expected the proof profile to be refused')
  } catch (error) {
    expect(error).toBeInstanceOf(RenderColorProfileError)
    expect(error).toBeInstanceOf(RenderRefusedError)
    expect(error).toMatchObject({ profile: 'proof', found: 'class mntr, color space RGB', supported: 'a CMYK output (prtr) profile' })
  }
})

test('image proof names its encoded byte ceiling and how to clear it', async () => {
  await expect(proofRasterImage(unusedTab, new Uint8Array(MAX_PROOF_IMAGE_BYTES + 1), { profile: buildPressProfile('mft1') })).rejects.toEqual(
    new RenderRefusedError(
      `The proof image input is ${MAX_PROOF_IMAGE_BYTES + 1} bytes; the ceiling is ${MAX_PROOF_IMAGE_BYTES} bytes. Reduce the encoded image size to clear this refusal.`,
    ),
  )
})

test('image proof refuses oversized dimensions before transferring or transforming pixels', async () => {
  const previous = {
    createImageBitmap: Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap'),
    OffscreenCanvas: Object.getOwnPropertyDescriptor(globalThis, 'OffscreenCanvas'),
  }
  let transferred = 0
  let evaluateCalls = 0
  Object.defineProperty(globalThis, 'createImageBitmap', {
    configurable: true,
    value: async () => ({ width: MAX_PROOF_IMAGE_PIXELS + 1, height: 1, close() {} }),
  })
  Object.defineProperty(globalThis, 'OffscreenCanvas', {
    configurable: true,
    value: class {
      constructor() {
        transferred++
        throw new Error('pixel transfer ran')
      }
    },
  })
  const tab = {
    evaluate: async <Arg, Result>(pageFunction: (arg: Arg) => Result | Promise<Result>, arg: Arg) => {
      evaluateCalls++
      return pageFunction(arg)
    },
  } as Tab
  try {
    await expect(proofRasterImage(tab, pngSignature, { profile: buildPressProfile('mft1') })).rejects.toEqual(
      new RenderRefusedError(
        `The proof image has ${MAX_PROOF_IMAGE_PIXELS + 1} pixels; the ceiling is ${MAX_PROOF_IMAGE_PIXELS} pixels. Reduce its pixel dimensions to clear this refusal.`,
      ),
    )
    expect(transferred).toBe(0)
    expect(evaluateCalls).toBe(1)
  } finally {
    if (previous.createImageBitmap) Object.defineProperty(globalThis, 'createImageBitmap', previous.createImageBitmap)
    else Reflect.deleteProperty(globalThis, 'createImageBitmap')
    if (previous.OffscreenCanvas) Object.defineProperty(globalThis, 'OffscreenCanvas', previous.OffscreenCanvas)
    else Reflect.deleteProperty(globalThis, 'OffscreenCanvas')
  }
})

test('a proofed JPEG request captures PNG and passes the requested quality to the final encode', async () => {
  const profile = buildPressProfile('mft1')
  expect(proofCaptureOptions({ format: 'jpeg', quality: [55], proof: { profile } })).toEqual({ format: 'png', quality: [55], limits: undefined })
  let encode: { format?: string; quality?: number } = {}
  const tab = {
    evaluate: async (_pageFunction: unknown, arg: { format?: string; mime?: string; quality?: number }) => {
      if (arg.mime) return { width: 1, height: 1, rgba: Buffer.from([0, 0, 0, 255]).toString('base64') }
      encode = arg
      return Buffer.from('out').toString('base64')
    },
  } as Tab
  await proofCapturedImage(tab, pngSignature, { format: 'jpeg', quality: [55], proof: { profile } })
  expect(encode).toMatchObject({ format: 'jpeg', quality: 0.55 })
})

test('proofImage lossy output uses the captureImage quality default', async () => {
  let quality: number | undefined
  const tab = {
    evaluate: async (_pageFunction: unknown, arg: { mime?: string; quality?: number }) => {
      if (arg.mime) return { width: 1, height: 1, rgba: Buffer.from([0, 0, 0, 255]).toString('base64') }
      quality = arg.quality
      return Buffer.from('out').toString('base64')
    },
  } as Tab
  await proofRasterImage(tab, pngSignature, { profile: buildPressProfile('mft1'), format: 'jpeg' })
  expect(quality).toBe(0.9)
})
