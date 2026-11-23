import { expect, test } from 'bun:test'
import { refuseUndefinedSlotPaths } from './slot-path-refusal.ts'
import { prepareSlots } from './slots.ts'

test('refuses an undefined value binding when there is no slot work', () => {
  expect(() => refuseUndefinedSlotPaths('<p data-slot-value="nope"></p>', [])).toThrow(
    'data-slot-value names undefined slot path "nope"; declare that slot or remove data-slot-value to clear this refusal',
  )
  expect(refuseUndefinedSlotPaths('<p data-slot-value="record.name"></p><time data-slot-value="asOf.date"></time>', ['asOf.date'])).toContain('record.name')
})

test('checks mixed-case value attribute names', () => {
  expect(() => refuseUndefinedSlotPaths('<p data-slot-VALUE="nope"></p>', [])).toThrow('data-slot-value names undefined slot path "nope"')
})

test('refuses a value binding absent from the merged document and host declarations', async () => {
  const host = await prepareSlots([], { declarations: [{ key: 'host.name', label: 'Host name', type: 'text' }] })
  expect(host.apply('<p data-slot-value="host.name"></p>')).toBe('<p></p>')
  expect(() => host.apply('<p data-slot-value="nope.path"></p>')).toThrow(
    'data-slot-value names undefined slot path "nope.path"; declare that slot or remove data-slot-value to clear this refusal',
  )
  expect(() => host.apply('<p data-slot-value="record.name"></p>')).not.toThrow()
})
