import { expect, test } from 'bun:test'
import { Refusal } from '@segnavia/format'
import { FontCssRefusedError } from './font-css.ts'
import { MotifRefusedError } from './motifs.ts'
import { RequiredSlotsRefusedError, UnmeasuredSlotsRefusedError } from './slot-policy.ts'
import { SlotFillsConflictError, SlotFillsRefusedError } from './slot-print.ts'
import { SlotFillRefusedError } from './slots.ts'

test.each([
  [new MotifRefusedError('message'), 'motif'],
  [new FontCssRefusedError('message'), 'font-css'],
  [new RequiredSlotsRefusedError([{ key: 'name', state: 'invalid' }]), 'required-slots'],
  [new UnmeasuredSlotsRefusedError(['name']), 'unmeasured-slots'],
  [new SlotFillRefusedError('sandboxed'), 'slot-fill'],
  [new SlotFillsConflictError(), 'slot-fills-conflict'],
  [new SlotFillsRefusedError([]), 'slot-fills'],
] as const)('%s is a refusal with code %s', (error, code) => {
  expect(error).toBeInstanceOf(Refusal)
  expect(error.code).toBe(code)
})

test('slot fill entries retain each refusal code', () => {
  const scripts = new SlotFillRefusedError('sandboxed')
  const required = new RequiredSlotsRefusedError([{ key: 'title', state: 'invalid' }])
  const error = new SlotFillsRefusedError([
    { index: 0, id: 'cover', slots: [], error: scripts },
    { index: 1, id: 'inside', slots: required.slots, error: required },
  ])
  expect(error.refusals).toEqual([
    { code: 'slot-fill', subject: 'cover', message: scripts.message },
    { code: 'required-slots', subject: 'inside', message: required.message },
  ])
})
