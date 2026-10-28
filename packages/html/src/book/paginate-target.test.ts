import { describe, expect, test } from 'bun:test'
import { heldPageNumber, pageIndexForTarget } from './paginate-target.ts'

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
    expect(pageIndexForTarget(pages, { flow: 'art', heldPage: 1 })).toBe(3)
    expect(pageIndexForTarget(pages, { flow: 'art', heldPage: 2 })).toBe(4)
    expect(pageIndexForTarget(pages, { flow: 'art', heldPage: 3 })).toBeUndefined()
    expect(heldPageNumber(pages, 3)).toBe(1)
    expect(heldPageNumber(pages, 4)).toBe(2)
  })

  test('maps an id inside a templated body page of flow f to that page', () => {
    const lesson = [flowPage('lesson', 'blank', false, [], true), flowPage('lesson', 'body', true), flowPage('lesson', 'body', false)]
    expect(pageIndexForTarget(lesson, { flow: 'lesson', heldPage: 1 })).toBe(1)
    expect(pageIndexForTarget(lesson, { flow: 'lesson', heldPage: 2 })).toBe(2)
    expect(pageIndexForTarget(lesson, { flow: 'lesson' })).toBe(1)
    expect(heldPageNumber(lesson, 1)).toBe(1)
    expect(heldPageNumber(lesson, 2)).toBe(2)
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
