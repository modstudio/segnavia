import { expect, test } from 'bun:test'
import { Page } from '@segnavia/format'
import { renderPageValue } from './page-value-render.ts'

test('a page without slot work writes its first document as final', () => {
  const writes: boolean[] = []
  let shows = 0
  const page = Page.parse({ html: '<p>Visible</p>' })

  renderPageValue(
    page,
    { date: '2026-11-22', zone: 'UTC', kind: 'current' },
    {},
    new AbortController().signal,
    { frame: {} as HTMLIFrameElement, generation: 1 },
    { css: '', origins: [] },
    {
      show: () => shows++,
      report: (error) => {
        throw error
      },
      write: (_document, provisional) => writes.push(provisional),
      composed: () => {},
      fit: () => {},
    },
  )

  expect(writes).toEqual([false])
  expect(shows).toBe(0)
})
