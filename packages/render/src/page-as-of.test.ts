import { expect, test } from 'bun:test'
import { Page } from '@segnavia/format'
import { resolveRenderDayContexts } from './page-as-of.ts'

const signal = new AbortController().signal

test('render pages resolve a shared as-of and slots once and report the distinct day', async () => {
  let anchors = 0
  let slots = 0
  const reports: unknown[] = []
  const pages = Array.from({ length: 3 }, (_, index) =>
    Page.parse({ id: String(index), html: '<time data-slot-value="asOf.date"></time>', asOf: { kind: 'anchor', anchor: 'week' } }),
  )
  const contexts = await resolveRenderDayContexts(
    pages,
    {
      moment: Date.parse('2026-11-14T12:00:00Z'),
      anchors: {
        choices: [{ name: 'week', label: 'Week' }],
        resolve: async () => {
          anchors++
          return '2026-11-09'
        },
      },
      slots: {
        resolve: async () => {
          slots++
          return { id: 'week', values: {} }
        },
      },
      asOf: { report: (days) => reports.push(days) },
    },
    signal,
  )
  expect({ anchors, slots }).toEqual({ anchors: 1, slots: 1 })
  expect(reports).toEqual([contexts.days])
  expect(contexts.days.map(({ date }) => date)).toEqual(['2026-11-09'])
})

test('render day resolution refuses an anchor the host cannot resolve', async () => {
  const page = Page.parse({ html: '<p>Page</p>', asOf: { kind: 'anchor', anchor: 'missing' } })
  await expect(
    resolveRenderDayContexts([page], { moment: 0, anchors: { choices: [{ name: 'offered', label: 'Offered' }], resolve: () => '2026-11-14' } }, signal),
  ).rejects.toThrow('choose one of "offered"')
})

test('render day resolution refuses distinct days under slots.resolve', async () => {
  const pages = [Page.parse({ html: '', asOf: { kind: 'fixed', date: '2026-11-09' } }), Page.parse({ html: '', asOf: { kind: 'fixed', date: '2026-11-10' } })]
  await expect(resolveRenderDayContexts(pages, { moment: 0, slots: { resolve: async () => undefined } }, signal)).rejects.toThrow(
    'print or render each day separately',
  )
})
