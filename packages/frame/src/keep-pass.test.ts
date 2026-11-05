import { describe, expect, test } from 'bun:test'
import { keepPassScript, outermostKeeps } from './keep-pass.ts'

const style = (value: string) => ({ getPropertyValue: () => value }) as unknown as CSSStyleDeclaration

describe('keep pass', () => {
  test('selects only the outermost element with an inherited direction', () => {
    const root = { parentElement: null }
    const outer = { parentElement: root }
    const inner = { parentElement: outer }
    const other = { parentElement: root }
    const values = new Map<unknown, string>([
      [root, ''],
      [outer, 'next'],
      [inner, 'next'],
      [other, 'previous'],
    ])
    const elements = [outer, inner, other] as unknown as Element[]
    expect(outermostKeeps(elements, (element) => style(values.get(element) ?? ''))).toEqual([outer, other] as unknown as Element[])
  })

  test('does no candidate query when the literal property is absent', () => {
    const queries: string[] = []
    let loaded: (() => void) | undefined
    const document = {
      addEventListener: (name: string, callback: () => void) => {
        if (name === 'DOMContentLoaded') loaded = callback
      },
      querySelectorAll: (selector: string) => {
        queries.push(selector)
        return []
      },
      styleSheets: [],
    }
    Function('document', 'window', 'getComputedStyle', keepPassScript())(document, { addEventListener: () => {} }, () => style(''))
    loaded?.()
    expect(queries).toEqual(['[style]'])
  })
})
