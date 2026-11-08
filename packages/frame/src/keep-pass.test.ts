import { describe, expect, test } from 'bun:test'
import { KEEP_WITH_CUSTOM_PROPERTY } from '@segnavia/format'
import { KEEP_WITH_VALUES } from '@segnavia/html'
import { keepGap } from './keep-gap.ts'
import { applyKeepWith, keepPassScript, outermostKeeps } from './keep-pass.ts'

const style = (value: string) => ({ getPropertyValue: () => value }) as unknown as CSSStyleDeclaration

class FakeNode {
  nodeValue: string | null = null
  parentNode: FakeElement | null = null

  constructor(readonly nodeType: number) {}

  get firstChild(): FakeNode | null {
    return this instanceof FakeElement ? (this.children[0] ?? null) : null
  }

  get lastChild(): FakeNode | null {
    return this instanceof FakeElement ? (this.children.at(-1) ?? null) : null
  }

  get nextSibling(): FakeNode | null {
    if (!this.parentNode) return null
    return this.parentNode.children[this.parentNode.children.indexOf(this) + 1] ?? null
  }

  get previousSibling(): FakeNode | null {
    if (!this.parentNode) return null
    return this.parentNode.children[this.parentNode.children.indexOf(this) - 1] ?? null
  }
}

class FakeText extends FakeNode {
  constructor(value: string) {
    super(3)
    this.nodeValue = value
  }
}

class FakeElement extends FakeNode {
  children: FakeNode[] = []
  display = 'inline'
  keepWith = ''
  whiteSpace = 'normal'
  style: { breakAfter?: string; breakBefore?: string } = {}

  constructor(
    readonly tagName: string,
    readonly marked = false,
  ) {
    super(1)
  }

  get parentElement(): FakeElement | null {
    return this.parentNode
  }

  append(...nodes: FakeNode[]): this {
    for (const node of nodes) {
      node.parentNode = this
      this.children.push(node)
    }
    return this
  }

  insertBefore(node: FakeNode, reference: FakeNode | null): FakeNode {
    node.parentNode = this
    const index = reference ? this.children.indexOf(reference) : this.children.length
    this.children.splice(index, 0, node)
    return node
  }

  contains(node: FakeNode | null): boolean {
    for (let current = node; current; current = current.parentNode) if (current === this) return true
    return false
  }

  getAttribute(name: string): string | null {
    return name === 'style' && this.marked ? `--segnavia-keep-with:${this.keepWith}` : null
  }
}

const text = (value: string) => new FakeText(value)
const element = (tag = 'SPAN', marked = false) => new FakeElement(tag, marked)
const styleOf = (node: Element) => {
  const fake = node as unknown as FakeElement
  return {
    display: fake.display,
    whiteSpace: fake.whiteSpace,
    getPropertyValue: (name: string) => (name === '--segnavia-keep-with' ? fake.keepWith : ''),
  } as CSSStyleDeclaration
}

function apply(root: FakeElement, candidates: FakeElement[]): void {
  const document = {
    createTextNode: (value: string) => text(value),
    querySelectorAll: (selector: string) => (selector === '[style]' ? candidates : []),
    styleSheets: [],
  }
  applyKeepWith(document as unknown as Document, styleOf, keepGap, KEEP_WITH_VALUES, KEEP_WITH_CUSTOM_PROPERTY)
  expect(root.contains(candidates[0] ?? null)).toBe(true)
}

describe('keep pass', () => {
  // The pass ships as function source; a bundler renames module bindings, so a
  // shipped function that read one would throw in the frame.
  test('shipped functions read no module constant', () => {
    for (const fn of [outermostKeeps, applyKeepWith]) expect(fn.toString()).not.toMatch(/\bKEEP_WITH_/)
  })

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
    expect(outermostKeeps(elements, (element) => style(values.get(element) ?? ''), KEEP_WITH_VALUES, KEEP_WITH_CUSTOM_PROPERTY)).toEqual([
      outer,
      other,
    ] as unknown as Element[])
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

  test('replaces next and previous gaps in place outside the kept element', () => {
    for (const direction of ['next', 'previous'] as const) {
      const kept = element('SPAN', true)
      kept.keepWith = direction
      kept.append(text('§'))
      const gap = text('  ')
      const root = element('DIV').append(...(direction === 'next' ? [kept, gap, text('word')] : [text('word'), gap, kept]))
      root.display = 'block'

      apply(root, [kept])

      expect(gap.nodeValue).toBe('\u00a0')
      expect(kept.children).toHaveLength(1)
      expect(gap.parentNode).toBe(root)
      expect(root.children.map((node) => node.nodeValue)).toEqual(
        direction === 'next' ? [null, '\u2060', '\u00a0', 'word'] : ['word', '\u00a0', '\u2060', null],
      )
    }
  })

  test('inserts a no-gap joiner as a sibling in either direction', () => {
    for (const direction of ['next', 'previous'] as const) {
      const kept = element('SPAN', true)
      kept.keepWith = direction
      kept.append(text('§'))
      const word = text('word')
      const root = element('DIV').append(...(direction === 'next' ? [kept, word] : [word, kept]))
      root.display = 'block'

      apply(root, [kept])

      expect(root.children.map((node) => node.nodeValue)).toEqual(direction === 'next' ? [null, '\u2060', 'word'] : ['word', '\u2060', null])
      expect(kept.children).toHaveLength(1)
    }
  })

  test('keeps a split gap at the piece adjacent to the kept element', () => {
    const kept = element('SPAN', true)
    kept.keepWith = 'next'
    const first = text(' ')
    const second = text(' ')
    const wrapper = element().append(second)
    const root = element('DIV').append(kept, first, wrapper, text('word'))
    root.display = 'block'

    apply(root, [kept])

    expect(first.nodeValue).toBe('\u00a0')
    expect(second.nodeValue).toBe('')
    expect(root.children.map((node) => node.nodeValue)).toEqual([null, '\u2060', '\u00a0', null, 'word'])
  })

  test('stops a gap walk at a neighboring img and joins its boundary', () => {
    const kept = element('SPAN', true)
    kept.keepWith = 'next'
    const nearGap = text(' ')
    const image = element('IMG')
    const farGap = text(' ')
    const root = element('DIV').append(kept, nearGap, image, farGap, text('word'))
    root.display = 'block'

    apply(root, [kept])

    expect(nearGap.nodeValue).toBe('\u00a0')
    expect(farGap.nodeValue).toBe(' ')
    expect(image.children).toHaveLength(0)
    expect(root.children).toEqual([
      kept,
      expect.objectContaining({ nodeValue: '\u2060' }),
      nearGap,
      expect.objectContaining({ nodeValue: '\u2060' }),
      image,
      farGap,
      expect.anything(),
    ])
  })

  test('replaces the gap after a kept img in place', () => {
    const image = element('IMG', true)
    image.keepWith = 'next'
    const gap = text(' ')
    const root = element('DIV').append(image, gap, text('word'))
    root.display = 'block'

    apply(root, [image])

    expect(gap.nodeValue).toBe('\u00a0')
    expect(gap.parentNode).toBe(root)
    expect(image.children).toHaveLength(0)
    expect(root.children).toEqual([image, expect.objectContaining({ nodeValue: '\u2060' }), gap, expect.anything()])
  })

  test('sets block break styles for both keep directions', () => {
    for (const direction of ['next', 'previous'] as const) {
      const kept = element('DIV', true)
      kept.display = 'block'
      kept.keepWith = direction
      const root = element('DIV').append(kept)
      root.display = 'block'

      apply(root, [kept])

      expect(kept.style).toEqual(direction === 'next' ? { breakAfter: 'avoid' } : { breakBefore: 'avoid' })
    }
  })
})
