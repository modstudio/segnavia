import { expect, test } from 'bun:test'
import { prepareSlots } from './slots.ts'

test('refuses a value binding absent from the merged document and host declarations', async () => {
  const host = await prepareSlots([], { declarations: [{ key: 'host.name', label: 'Host name', type: 'text' }] })
  expect(host.apply('<p data-slot-value="host.name"></p>')).toBe('<p></p>')
  expect(() => host.apply('<p data-slot-value="nope.path"></p>')).toThrow(
    'data-slot-value names undefined slot path "nope.path"; declare that slot or remove data-slot-value to clear this refusal',
  )
  expect(() => host.apply('<p data-slot-value="record.name"></p>')).not.toThrow()
})
