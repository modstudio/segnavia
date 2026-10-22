import { expect, test } from 'bun:test'
import { proof } from './color/engine.ts'
import { readProfile } from './color/profile.ts'
import { buildPressProfile } from './color/profile-fixture.test-helper.ts'
import { buildProofTable } from './color/proof.ts'
import { proofRgba } from './proof-image-transform.ts'

test('a proofed raster pixel matches the exact engine proof and keeps alpha', () => {
  const profile = readProfile(buildPressProfile('mft2'))
  const source = Uint8Array.from([0, 127, 255, 61, 240, 35, 80, 255])
  const result = proofRgba(buildProofTable(profile), source)
  for (let offset = 0; offset < source.length; offset += 4) {
    const exact = proof(profile, [(source[offset] ?? 0) / 255, (source[offset + 1] ?? 0) / 255, (source[offset + 2] ?? 0) / 255])
    for (let channel = 0; channel < 3; channel++)
      expect(Math.abs((result[offset + channel] ?? 0) - Math.round((exact[channel] ?? 0) * 255))).toBeLessThanOrEqual(3)
    expect(result[offset + 3]).toBe(source[offset + 3])
  }
})
