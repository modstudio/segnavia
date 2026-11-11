import { expect, test } from 'bun:test'
import { Deck, Page } from '@segnavia/format'
import { fillBookAsOfBindings, fillDeckAsOfBindings, parseBookFixture } from '@segnavia/html'
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

test.each([
  Deck.parse({
    title: 'Deck',
    size: { width: 400, height: 200 },
    asOf: { kind: 'anchor', anchor: 'missing' },
    slides: [{ id: 'one', content: { kind: 'html', html: '<p>Slide</p>' } }],
  }),
  parseBookFixture({ title: 'Book', mode: 'continuous', asOf: { kind: 'anchor', anchor: 'missing' }, chapters: [{ title: 'One', html: '<p>Text</p>' }] }),
])('a deck or book refusal names its unresolvable anchor', async (record) => {
  await expect(resolveRenderDayContexts([record], { moment: 0, anchors: { choices: [], resolve: () => null } }, signal)).rejects.toThrow('"missing"')
})

test('render day resolution refuses distinct days under slots.resolve', async () => {
  const pages = [Page.parse({ html: '', asOf: { kind: 'fixed', date: '2026-11-09' } }), Page.parse({ html: '', asOf: { kind: 'fixed', date: '2026-11-10' } })]
  await expect(resolveRenderDayContexts(pages, { moment: 0, slots: { resolve: async () => undefined } }, signal)).rejects.toThrow(
    'print or render each day separately',
  )
})

test('a deck reports and binds its fixed day, gives its zone precedence and establishes day slots', async () => {
  const reports: unknown[] = []
  let slotDate: string | undefined
  const deck = Deck.parse({
    title: 'Dated deck',
    size: { width: 400, height: 200 },
    asOf: { kind: 'fixed', date: '2026-11-09', zone: 'America/New_York' },
    slides: [{ id: 'one', content: { kind: 'html', html: '<time data-slot-value="asOf.date"></time>' } }],
  })
  const contexts = await resolveRenderDayContexts(
    [deck],
    {
      asOf: { zone: 'Europe/Berlin', report: (days) => reports.push(days) },
      slots: {
        resolve: async ({ day }) => {
          slotDate = day.date
          return undefined
        },
      },
    },
    signal,
  )
  const day = contexts.pages[0]?.day
  const filled = day && fillDeckAsOfBindings(deck, day)

  expect(day).toMatchObject({ date: '2026-11-09', zone: 'America/New_York' })
  expect(slotDate).toBe('2026-11-09')
  expect(reports).toEqual([[expect.objectContaining({ date: '2026-11-09', zone: 'America/New_York' })]])
  expect(filled?.slides[0]?.content).toEqual({ kind: 'html', html: '<time dir="auto">2026-11-09</time>' })
})

test('a book fills furniture as-of moments from the host moment', async () => {
  const moment = Date.parse('2026-11-14T13:00:00Z')
  const book = parseBookFixture({
    title: 'Dated book',
    mode: 'paginated',
    page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
    asOf: { kind: 'current', zone: 'America/New_York' },
    parentPages: [{ name: 'dated', basedOn: 'segnavia:recto', regions: { head: { edge: 'blockStart', html: '<time data-slot-value="asOf.moment"></time>' } } }],
    chapters: [{ title: 'One', html: '<p>Text</p>' }],
  })
  const contexts = await resolveRenderDayContexts([book], { moment }, signal)
  const day = contexts.pages[0]?.day
  const filled = day && fillBookAsOfBindings(book, day)

  expect(filled?.parentPages[0]?.regions.head?.html).toContain('2026-11-14T08:00:00-05:00')
})
