import { expect, test } from 'bun:test'
import type { Page as Tab } from 'playwright-core'
import { buildGrayProfile, buildPressProfile } from './color/profile-fixture.test-helper.ts'
import { RenderRefusedError } from './errors.ts'
import { MAX_PROOF_IMAGE_BYTES, proofRasterImage } from './proof-image.ts'

const unusedTab = {} as Tab

test('image proof refuses a profile that is not a CMYK output profile', async () => {
  await expect(proofRasterImage(unusedTab, Uint8Array.of(), { profile: buildGrayProfile('mft1') })).rejects.toThrow(
    'The proof profile is not a CMYK output profile',
  )
})

test('image proof names its encoded byte ceiling and how to clear it', async () => {
  await expect(proofRasterImage(unusedTab, new Uint8Array(MAX_PROOF_IMAGE_BYTES + 1), { profile: buildPressProfile('mft1') })).rejects.toEqual(
    new RenderRefusedError(
      `The proof image input is ${MAX_PROOF_IMAGE_BYTES + 1} bytes; the ceiling is ${MAX_PROOF_IMAGE_BYTES} bytes. Reduce the encoded image size to clear this refusal.`,
    ),
  )
})
