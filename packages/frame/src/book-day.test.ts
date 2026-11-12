import { expect, test } from 'bun:test'
import type { BookView } from '@segnavia/format'
import { reflectedBookElement, switchableBookView } from './book-test-view.ts'

test('book emits its fixed day and fills parent-page furniture', () => {
  const { book } = reflectedBookElement()
  const days: string[] = []
  book.addEventListener('asof', (event) => days.push((event as CustomEvent<{ date: string }>).detail.date))
  const view = switchableBookView()
  view.asOf = { kind: 'fixed', date: '2026-11-14' }
  view.pagination?.parents.push({ name: 'dated', regions: { head: { edge: 'blockStart', html: '<time data-slot-value="asOf.date"></time>' } } })
  book.view = view
  const prepared = (book as unknown as { preparedView: BookView }).preparedView
  expect(days).toEqual(['2026-11-14'])
  expect(prepared.pagination?.parents[0]?.regions.head?.html).toContain('2026-11-14')
})

test('book reloads a current view from the host moment', () => {
  const { book } = reflectedBookElement()
  const dates: string[] = []
  book.addEventListener('asof', (event) => dates.push((event as CustomEvent<{ date: string }>).detail.date))
  book.moment = Date.parse('2026-11-15T01:00:00Z')
  book.view = { html: '<main>Book</main>', asOf: { kind: 'current', zone: 'America/New_York' } }
  expect(dates).toEqual(['2026-11-14'])
})
