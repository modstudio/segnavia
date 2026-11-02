import { describe, expect, test } from 'bun:test'
import { decideBookMeasurement, pageReferenceFolio, unmeasuredFlows } from './book-composer.ts'

const facts = {
  frameWidth: 800,
  flows: [{ id: 'chapter-1', sourceBlocks: 1, contentBlocks: 1, measuredLines: 1 }],
  plannedPages: 1,
  visibleElapsedMs: 0,
}

describe('decideBookMeasurement', () => {
  test('waits without a bound while the frame has no width', () => {
    expect(decideBookMeasurement({ ...facts, frameWidth: 0, visibleElapsedMs: 2_000 }, 1_000)).toBe('wait-for-width')
  })

  test('retries deferred line measurement and page planning within the bound', () => {
    expect(
      decideBookMeasurement({ ...facts, flows: [{ id: 'chapter-1', sourceBlocks: 1, contentBlocks: 1, measuredLines: 0 }], visibleElapsedMs: 999 }, 1_000),
    ).toBe('retry')
    expect(decideBookMeasurement({ ...facts, plannedPages: 0, visibleElapsedMs: 999 }, 1_000)).toBe('retry')
  })

  test('composes measured or empty source content', () => {
    expect(decideBookMeasurement(facts, 1_000)).toBe('compose')
    expect(decideBookMeasurement({ ...facts, flows: [{ id: 'cover', sourceBlocks: 0, contentBlocks: 0, measuredLines: 0 }], plannedPages: 0 }, 1_000)).toBe(
      'compose',
    )
  })

  test('refuses deferred line measurement or page planning at the bound', () => {
    expect(
      decideBookMeasurement({ ...facts, flows: [{ id: 'chapter-1', sourceBlocks: 1, contentBlocks: 1, measuredLines: 0 }], visibleElapsedMs: 1_000 }, 1_000),
    ).toBe('refuse')
    expect(decideBookMeasurement({ ...facts, plannedPages: 0, visibleElapsedMs: 1_000 }, 1_000)).toBe('refuse')
  })

  test('defers while any source flow has no measured lines', () => {
    const flows = [
      { id: 'chapter-1', sourceBlocks: 2, contentBlocks: 2, measuredLines: 20 },
      { id: 'chapter-2', sourceBlocks: 3, contentBlocks: 3, measuredLines: 0 },
    ]
    expect(decideBookMeasurement({ ...facts, flows, visibleElapsedMs: 999 }, 1_000)).toBe('retry')
    expect(decideBookMeasurement({ ...facts, flows, visibleElapsedMs: 1_000 }, 1_000)).toBe('refuse')
  })

  test('composes when an empty source flow sits beside a measured flow', () => {
    const flows = [
      { id: 'chapter-1', sourceBlocks: 2, contentBlocks: 2, measuredLines: 20 },
      { id: 'chapter-2', sourceBlocks: 2, contentBlocks: 0, measuredLines: 0 },
    ]
    expect(decideBookMeasurement({ ...facts, flows, visibleElapsedMs: 1_000 }, 1_000)).toBe('compose')
  })

  test('composes a book whose only flows are empty', () => {
    const flows = [
      { id: 'chapter-1', sourceBlocks: 2, contentBlocks: 0, measuredLines: 0 },
      { id: 'chapter-2', sourceBlocks: 1, contentBlocks: 0, measuredLines: 0 },
    ]
    expect(decideBookMeasurement({ ...facts, flows, plannedPages: 0, visibleElapsedMs: 1_000 }, 1_000)).toBe('compose')
  })

  test('ignores fixed flows beside measured source flows', () => {
    const flows = [
      { id: 'cover', sourceBlocks: 0, contentBlocks: 0, measuredLines: 0 },
      { id: 'chapter-1', sourceBlocks: 2, contentBlocks: 2, measuredLines: 20 },
      { id: 'back-cover', sourceBlocks: 0, contentBlocks: 0, measuredLines: 0 },
    ]
    expect(decideBookMeasurement({ ...facts, flows }, 1_000)).toBe('compose')
  })
})

test('lists exactly the unmeasured source flows in order', () => {
  expect(
    unmeasuredFlows([
      { id: 'cover', sourceBlocks: 0, contentBlocks: 0, measuredLines: 0 },
      { id: 'chapter-1', sourceBlocks: 2, contentBlocks: 2, measuredLines: 0 },
      { id: 'empty', sourceBlocks: 2, contentBlocks: 0, measuredLines: 0 },
      { id: 'chapter-2', sourceBlocks: 3, contentBlocks: 3, measuredLines: 12 },
      { id: 'chapter-3', sourceBlocks: 1, contentBlocks: 1, measuredLines: 0 },
    ]),
  ).toEqual(['chapter-1', 'chapter-3'])
})

test('refuses a page reference beyond the folio table', () => {
  expect(
    pageReferenceFolio(
      'appendix',
      501,
      Array.from({ length: 500 }, (_, index) => String(index + 1)),
    ),
  ).toEqual({
    refusal:
      'page reference target appendix lands on folio 501, beyond the supported folio table; shorten the book to 500 folios or fewer to clear this refusal',
  })
})
