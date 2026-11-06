import { describe, expect, test } from 'bun:test'
import { readinessRefusal, renderReadiness } from './render-readiness.ts'

describe('renderReadiness', () => {
  test.each([
    ['refuse', false, { author: false, diagrams: false }],
    ['refuse', true, { author: false, diagrams: true }],
    ['sandboxed', false, { author: true, diagrams: false }],
    ['sandboxed', true, { author: true, diagrams: true }],
  ] as const)('derives the facts for scripts=%s and diagrams=%s', (scripts, diagrams, expected) => {
    expect(renderReadiness(scripts, diagrams)).toEqual(expected)
  })

  test('the host can opt out of both facts', () => {
    expect(renderReadiness('sandboxed', true, false)).toEqual({ author: false, diagrams: false })
  })

  test('a refusal names every applicable fact that did not settle', () => {
    expect(readinessRefusal({ author: true, diagrams: true }, { author: false, diagrams: false }, 10)).toBe(
      "The page did not call window.pageReady() and the page's diagrams did not finish drawing within 10s. Call window.pageReady() or render with waitForPageReady: false; correct or simplify the diagram source so it draws within the bound to clear this refusal.",
    )
    expect(readinessRefusal({ author: false, diagrams: true }, { author: true, diagrams: false }, 10)).toBe(
      "The page's diagrams did not finish drawing within 10s. Correct or simplify the diagram source so it draws within the bound to clear this refusal.",
    )
  })
})
