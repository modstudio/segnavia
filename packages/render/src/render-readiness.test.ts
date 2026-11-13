import { describe, expect, test } from 'bun:test'
import { readinessRefusal, recordedLayoutRefusal, renderReadiness } from './render-readiness.ts'

describe('renderReadiness', () => {
  test('derives author and provider settlement facts', () => {
    expect(renderReadiness('refuse')).toEqual({ author: false, layouts: false })
    expect(renderReadiness('sandboxed')).toEqual({ author: true, layouts: false })
    expect(renderReadiness('refuse', true, true)).toEqual({ author: false, layouts: true })
    expect(renderReadiness('sandboxed', false, true)).toEqual({ author: false, layouts: false })
  })

  test('a refusal names each applicable fact that did not settle', () => {
    expect(readinessRefusal({ author: true, layouts: true }, { author: false, layouts: false }, 10)).toContain(
      "page did not call window.pageReady() and the page's layout provider galley and composed phases did not finish",
    )
  })
})

test('a recorded layout refusal is bounded and wins over the generic readiness refusal', () => {
  const generic = 'Layout providers did not finish.'
  expect(recordedLayoutRefusal(null, generic)).toBe(generic)
  expect(recordedLayoutRefusal('x'.repeat(1200), generic)).toBe('x'.repeat(1024))
})
