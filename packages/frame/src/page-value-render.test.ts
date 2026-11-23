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

test('a page without slot work reports an undefined slot path', () => {
  const errors: unknown[] = []
  let fits = 0
  let writes = 0
  const page = Page.parse({ html: '<p data-slot-value="nope.path">Visible</p>' })

  expect(() =>
    renderPageValue(
      page,
      { date: '2026-11-22', zone: 'UTC', kind: 'current' },
      {},
      new AbortController().signal,
      { frame: {} as HTMLIFrameElement, generation: 1 },
      { css: '', origins: [] },
      {
        show: () => {},
        report: (error) => errors.push(error),
        write: () => writes++,
        composed: () => {},
        fit: () => fits++,
      },
    ),
  ).not.toThrow()

  expect(errors).toHaveLength(1)
  expect(errors[0]).toBeInstanceOf(RangeError)
  expect((errors[0] as Error).message).toContain('data-slot-value names undefined slot path "nope.path"')
  expect(fits).toBe(1)
  expect(writes).toBe(0)
})
