import { expect, test } from 'bun:test'
import { Page, type SlotsOptions } from '@segnavia/format'
import { parseAsOfInputs, resolveDayContextsFor, resolveDocumentDayContexts } from './document-day-context.ts'

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

test('refuses distinct days under one resolved source before resolving slots', async () => {
  let slotCalls = 0
  const pages = [Page.parse({ html: '', asOf: { kind: 'fixed', date: '2026-11-09' } }), Page.parse({ html: '', asOf: { kind: 'fixed', date: '2026-11-10' } })]
  const resolution = resolveDocumentDayContexts(pages, {
    moment: 0,
    slots: {
      resolve: async () => {
        slotCalls++
        return undefined
      },
    },
    refuseMixedResolvedDays: true,
    signal: signal(),
  })

  await expect(resolution).rejects.toThrow('distinct as-of days "2026-11-09" (fixed, UTC), "2026-11-10" (fixed, UTC)')
  await expect(resolution).rejects.toThrow('print or render each day separately')
  expect(slotCalls).toBe(0)
})

test('allows distinct days when every page uses the same static source', async () => {
  const source = { id: 'shared', values: { title: 'Bulletin' } }
  const contexts = await resolveDocumentDayContexts(
    [Page.parse({ html: '', asOf: { kind: 'fixed', date: '2026-11-09' } }), Page.parse({ html: '', asOf: { kind: 'fixed', date: '2026-11-10' } })],
    { moment: 0, slots: { source }, refuseMixedResolvedDays: true, signal: signal() },
  )

  expect(contexts.days.map(({ date }) => date)).toEqual(['2026-11-09', '2026-11-10'])
  expect(contexts.pages.map(({ slots }) => slots.source)).toEqual([source, source])
})

test('host as-of inputs refuse a non-finite moment and an invalid zone with remedies', () => {
  expect(() => parseAsOfInputs({ moment: Number.NaN })).toThrow('moment must be finite epoch milliseconds')
  expect(() => parseAsOfInputs({ asOf: { zone: 'Europe/Berlin ' as 'UTC' } })).toThrow(
    'asOf.zone must be a time zone accepted by Intl.DateTimeFormat; change "Europe/Berlin " to an accepted zone',
  )
})

test('the surface resolver reports the distinct days after resolving them', async () => {
  const reports: unknown[] = []
  const contexts = await resolveDayContextsFor(
    [Page.parse({ html: '', asOf: { kind: 'fixed', date: '2026-11-09' } }), Page.parse({ html: '', asOf: { kind: 'fixed', date: '2026-11-10' } })],
    { moment: 0, asOf: { report: (days) => reports.push(days) } },
    undefined,
    signal(),
  )
  expect(reports).toEqual([contexts.days])
})
