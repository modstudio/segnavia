import { expect, test } from 'bun:test'
import { MESSAGE } from '@segnavia/frame/bridge'
import { prepareSlots, RequiredSlotsRefusedError, UnmeasuredSlotsRefusedError } from '@segnavia/html'
import type { Page } from 'playwright-core'
import { mergeCapturedSlotFit } from './slot-fit.ts'

test('server measurement refuses an overflowed refuse slot', async () => {
  const prepared = await prepareSlots([{ key: 'name', label: 'Name', type: 'text', required: false, overflow: 'refuse' }], {
    fill: { id: 'long', values: { name: 'A long name' } },
  })
  const tab = {
    waitForFunction: async () => {},
    evaluate: async () => [{ type: MESSAGE.slotFit, slots: { name: 'overflowed' } }],
  } as unknown as Page
  await expect(mergeCapturedSlotFit(tab, prepared, 100)).rejects.toBeInstanceOf(RequiredSlotsRefusedError)
})

test('server measurement refuses a filled refuse slot when no fit result arrives', async () => {
  const prepared = await prepareSlots([{ key: 'name', label: 'Name', type: 'text', required: false, overflow: 'refuse' }], {
    fill: { id: 'long', values: { name: 'A long name' } },
  })
  prepared.apply('<p data-slot-value="name">Name</p>')
  const tab = {
    waitForFunction: async () => {
      throw new Error('deadline')
    },
    evaluate: async () => [],
  } as unknown as Page
  await expect(mergeCapturedSlotFit(tab, prepared, 100)).rejects.toBeInstanceOf(UnmeasuredSlotsRefusedError)
})
