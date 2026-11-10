import { expect, test } from 'bun:test'
import { limitRefusal } from '@segnavia/format'
import { pagesSheetsExceeded, printPages } from './print.ts'

test('browser page print refuses a non-finite moment before creating output', async () => {
  await expect(printPages([], { paper: 'letter', columns: 1, rows: 1, cell: { width: 1, height: 1 } }, { moment: Number.NaN })).rejects.toThrow(
    'moment must be finite epoch milliseconds.',
  )
})

test('browser page print refuses distinct days under slots.resolve before creating output', async () => {
  const pages = [
    {
      type: 'document' as const,
      kind: 'page' as const,
      asOf: { kind: 'fixed' as const, date: '2026-11-09' },
      children: [{ type: 'page' as const, body: { html: '' } }],
    },
    {
      type: 'document' as const,
      kind: 'page' as const,
      asOf: { kind: 'fixed' as const, date: '2026-11-10' },
      children: [{ type: 'page' as const, body: { html: '' } }],
    },
  ]
  await expect(
    printPages(pages, { paper: 'letter', columns: 1, rows: 1, cell: { width: 1, height: 1 } }, { slots: { resolve: async () => undefined } }),
  ).rejects.toThrow('print or render each day separately')
})

test('a prepared print above the sheet limit carries the measured refusal', () => {
  expect(pagesSheetsExceeded(4, { sheets: 3 })).toEqual({
    measure: 'sheets',
    limit: 3,
    actual: 4,
    message: limitRefusal('sheets', 4, 3),
  })
  expect(pagesSheetsExceeded(3, { sheets: 3 })).toBeUndefined()
})
