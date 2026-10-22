import { expect, test } from 'bun:test'
import type { SlotReport, SlotsOptions } from '@segnavia/format'
import { collectSlotPrintCopies, SlotFillsConflictError, SlotFillsRefusedError, slotFillCopyId } from './slot-print.ts'
import { RequiredSlotsRefusedError, SlotFillRefusedError, UnmeasuredSlotsRefusedError } from './slots.ts'

const ada = { fill: { id: 'ada', values: { name: 'Ada' } } }
const bea = { fill: { id: 'bea', values: { name: 'Bea' } } }
const missing = { fill: { id: 'missing', values: {} } }
const anonymous = { source: { id: 'staff', values: { name: 'Source' } } }

test('fills together with fill or source is refused at the edge', async () => {
  const fills = [ada]
  await expect(collectSlotPrintCopies({ fills, fill: ada.fill }, async () => 1)).rejects.toBeInstanceOf(SlotFillsConflictError)
  await expect(collectSlotPrintCopies({ fills, source: ada.fill }, async () => 1)).rejects.toBeInstanceOf(SlotFillsConflictError)
  await expect(collectSlotPrintCopies({ fills, fill: ada.fill }, async () => 1)).rejects.toThrow(
    'slots.fills cannot be given together with slots.fill or slots.source',
  )
})

test('copies run in entry order and keep one result per entry', async () => {
  const seen: string[] = []
  const copies = await collectSlotPrintCopies({ fills: [ada, bea] }, async (copy) => {
    seen.push(copy.fill?.id ?? '')
    return copy.fill?.values.name
  })
  expect(seen).toEqual(['ada', 'bea'])
  expect(copies).toEqual(['Ada', 'Bea'])
})

test('the host report is called once per entry in entry order', async () => {
  const reports: SlotReport[] = []
  await collectSlotPrintCopies(
    {
      fills: [ada, bea],
      report: (report) => reports.push(report),
    },
    async (copy) => {
      copy.report?.({ fill: copy.fill?.id ?? null, slots: { name: 'filled' }, origins: { name: 'hand' } })
      return copy.fill?.id
    },
  )
  expect(reports.map((report) => report.fill)).toEqual(['ada', 'bea'])
})

test('default refusal lists every refused entry with its fill id or index and slot states', async () => {
  const job = collectSlotPrintCopies({ fills: [missing, anonymous] }, async (copy) => {
    if (copy.fill?.id === 'missing') {
      throw new RequiredSlotsRefusedError([{ key: 'name', state: 'placeholder' }])
    }
    throw new RequiredSlotsRefusedError([
      { key: 'email', state: 'invalid' },
      { key: 'site', state: 'overflowed' },
    ])
  })
  await expect(job).rejects.toBeInstanceOf(SlotFillsRefusedError)
  await expect(job).rejects.toThrow('"missing" "name" (placeholder); 1 "email" (invalid), "site" (overflowed)')
  await expect(job).rejects.toThrow('Fill required slots')
  expect(slotFillCopyId(anonymous, 1)).toBe('1')
})

test('skipRefused prints the remaining copies and reports refused entries', async () => {
  const reports: SlotReport[] = []
  const copies = await collectSlotPrintCopies(
    {
      fills: [ada, missing, bea],
      skipRefused: true,
      report: (report) => reports.push(report),
    },
    async (copy) => {
      if (copy.fill?.id === 'missing') {
        copy.report?.({ fill: 'missing', slots: { name: 'placeholder' }, origins: {} })
        throw new RequiredSlotsRefusedError([{ key: 'name', state: 'placeholder' }])
      }
      copy.report?.({ fill: copy.fill?.id ?? null, slots: { name: 'filled' }, origins: { name: 'hand' } })
      return copy.fill?.id
    },
  )
  expect(copies).toEqual(['ada', 'bea'])
  expect(reports.map((report) => report.fill)).toEqual(['ada', 'missing', 'bea'])
  expect(reports[1]?.slots).toEqual({ name: 'placeholder' })
})

test('skipRefused still refuses when every entry is refused', async () => {
  const job = collectSlotPrintCopies({ fills: [missing, anonymous], skipRefused: true }, async (copy) => {
    if (copy.fill) throw new SlotFillRefusedError('sandboxed')
    throw new UnmeasuredSlotsRefusedError(['title'])
  })
  await expect(job).rejects.toBeInstanceOf(SlotFillsRefusedError)
  await expect(job).rejects.toThrow('"missing" (scripts: \'sandboxed\'); 1 "title" (unmeasured)')
  await expect(job).rejects.toThrow("Set the item's scripts to 'refuse'")
  await expect(job).rejects.toThrow('overflow from')
})

test('an empty fills list is refused rather than printing nothing', async () => {
  await expect(collectSlotPrintCopies({ fills: [] }, async () => 1)).rejects.toBeInstanceOf(SlotFillsRefusedError)
  await expect(collectSlotPrintCopies({ fills: [] }, async () => 1)).rejects.toThrow('slots.fills has no entries')
})

test('without fills a single copy keeps the original options including report', async () => {
  const options: SlotsOptions = { fill: ada.fill, report() {} }
  let received: SlotsOptions | undefined
  expect(
    await collectSlotPrintCopies(options, async (copy) => {
      received = copy
      return 'one'
    }),
  ).toEqual(['one'])
  expect(received).toBe(options)
})
