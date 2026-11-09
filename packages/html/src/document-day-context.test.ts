import { expect, test } from 'bun:test'
import { Page, type SlotsOptions } from '@segnavia/format'
import { resolveDocumentDayContexts } from './document-day-context.ts'

const signal = () => new AbortController().signal

test('resolves one day and one fill for three pages with the same anchor', async () => {
  let anchorCalls = 0
  let slotCalls = 0
  const pages = Array.from({ length: 3 }, (_, index) => Page.parse({ id: String(index), html: '<p>Page</p>', asOf: { kind: 'anchor', anchor: 'week' } }))
  const contexts = await resolveDocumentDayContexts(pages, {
    moment: Date.parse('2026-11-14T12:00:00Z'),
    anchors: {
      choices: [{ name: 'week', label: 'Week' }],
      resolve: async () => {
        anchorCalls++
        return '2026-11-09'
      },
    },
    slots: {
      resolve: async ({ day }) => {
        slotCalls++
        return { id: day.date, values: { date: day.date } }
      },
    },
    signal: signal(),
  })

  expect(anchorCalls).toBe(1)
  expect(slotCalls).toBe(1)
  expect(contexts.days).toHaveLength(1)
  expect(contexts.pages.map((context) => context.day.date)).toEqual(['2026-11-09', '2026-11-09', '2026-11-09'])
})

test('resolves stored values once and fills once per distinct resulting day', async () => {
  let anchorCalls = 0
  let slotCalls = 0
  const slots: SlotsOptions = {
    resolve: async ({ day }) => {
      slotCalls++
      return { id: day.date, values: {} }
    },
  }
  const contexts = await resolveDocumentDayContexts(
    [
      Page.parse({ html: '', asOf: { kind: 'anchor', anchor: 'week' } }),
      Page.parse({ html: '', asOf: { kind: 'anchor', anchor: 'week' } }),
      Page.parse({ html: '', asOf: { kind: 'fixed', date: '2026-11-10' } }),
    ],
    {
      moment: Date.parse('2026-11-14T12:00:00Z'),
      anchors: {
        choices: [{ name: 'week', label: 'Week' }],
        resolve: () => {
          anchorCalls++
          return '2026-11-09'
        },
      },
      slots,
      signal: signal(),
    },
  )

  expect(anchorCalls).toBe(1)
  expect(slotCalls).toBe(2)
  expect(contexts.days.map((day) => day.date)).toEqual(['2026-11-09', '2026-11-10'])
})
