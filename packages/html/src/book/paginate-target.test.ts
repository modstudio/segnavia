import { describe, expect, test } from 'bun:test'
import { pageIndexForTarget } from './paginate-target.ts'

const flowPage = (
  flow: string,
  role: 'opener' | 'body' | 'blank' | 'fixed',
  sectionOpening: boolean,
  windows: Array<{ flow: string; start: number; end: number; top: number; column: number; columns: number }> = [],
  blank = false,
) => ({
  blank,
  flow,
  role,
  sectionOpening,
  windows,
})

describe('pageIndexForTarget', () => {
  const pages = [
    flowPage('c1', 'opener', true, [{ flow: 'c1', start: 0, end: 50, top: 0, column: 0, columns: 1 }]),
    flowPage('c1', 'body', false, [{ flow: 'c1', start: 50, end: 100, top: 0, column: 0, columns: 1 }]),
    flowPage('art', 'blank', false, [], true),
    flowPage('art', 'fixed', true),
    flowPage('art', 'fixed', false),
    flowPage('c2', 'opener', true, [{ flow: 'c2', start: 0, end: 40, top: 0, column: 0, columns: 1 }]),
  ]

  test('maps an id inside fixed page m of flow f to that page', () => {
    expect(pageIndexForTarget(pages, { flow: 'art', designedPage: 1 })).toBe(3)
    expect(pageIndexForTarget(pages, { flow: 'art', designedPage: 2 })).toBe(4)
    expect(pageIndexForTarget(pages, { flow: 'art', designedPage: 3 })).toBeUndefined()
  })

  test('maps a windowed top to the page that holds it', () => {
    expect(pageIndexForTarget(pages, { flow: 'c1', top: 10 })).toBe(0)
    expect(pageIndexForTarget(pages, { flow: 'c1', top: 50 })).toBe(1)
    expect(pageIndexForTarget(pages, { flow: 'c1', top: 99 })).toBe(1)
  })

  test('falls back to the flow opener when no window holds the top', () => {
    expect(pageIndexForTarget(pages, { flow: 'c1', top: 200 })).toBe(0)
    expect(pageIndexForTarget(pages, { flow: 'c1' })).toBe(0)
    expect(pageIndexForTarget(pages, { flow: 'art' })).toBe(3)
  })
})
