import { expect, test } from 'bun:test'
import { MESSAGE } from '@segnavia/frame/bridge'
import { prepareSlots, RequiredSlotsRefusedError } from '@segnavia/html'
import type { Page } from 'playwright-core'
import { slotsForDocument } from './slot-document.ts'
import { mergeCapturedSlotFit } from './slot-fit.ts'

test('a deck document slot view groups each slide and reads fit results merged through the view', async () => {
  const slots = await prepareSlots([{ key: 'name', label: 'Name', type: 'text', required: false, overflow: 'refuse' }], {
    fill: { id: 'host', values: { name: 'A name that overflows' } },
  })
  slots.apply('<p data-slot-value="name">Name</p>')
  slots.apply('<p data-slot-value="name">Name again</p>')
  const view = slotsForDocument(slots, [[0], [1]])
  const tab = {
    waitForFunction: async () => {},
    evaluate: async () => [{ type: MESSAGE.slotFit, slots: { name: 'overflowed' } }],
  } as unknown as Page

  expect(view.marked.get('name')).toBe(2)
  await expect(mergeCapturedSlotFit(tab, view, 100)).rejects.toBeInstanceOf(RequiredSlotsRefusedError)
  expect(view.report.slots.name).toBe('overflowed')
  expect(slots.report.slots.name).toBe('overflowed')
})
