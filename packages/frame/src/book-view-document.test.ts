import { expect, test } from 'bun:test'
import { PREFLIGHT_PRESETS, regionOverflowRefusalEnabled } from '@segnavia/format'

test('region overflow refusal uses the default when omitted and only explicit overset off suppresses it', () => {
  expect(regionOverflowRefusalEnabled()).toBeTrue()
  expect(regionOverflowRefusalEnabled(PREFLIGHT_PRESETS.default)).toBeTrue()
  expect(regionOverflowRefusalEnabled({ ...PREFLIGHT_PRESETS.default, 'region-overset': 'off' })).toBeFalse()
  expect(regionOverflowRefusalEnabled({ ...PREFLIGHT_PRESETS.default, 'region-truncated': 'off' })).toBeTrue()
})
