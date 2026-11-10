import { afterEach, describe, expect, test } from 'bun:test'
import { BoardDecorations } from './board-decorations.ts'

class ElementStub {
  dataset: Record<string, string> = {}
  style: Record<string, string> = {}
  children: ElementStub[] = []
  parent: ElementStub | undefined
  textContent: string | null = ''
  dir = ''
  part = { add() {} }
  append(child: ElementStub) {
    child.parent = this
    this.children.push(child)
  }
  insertBefore(child: ElementStub) {
    this.append(child)
  }
  querySelector(selector: string): ElementStub | null {
    if (selector === '[data-board-label-text]') return this.children.find((child) => 'boardLabelText' in child.dataset) ?? null
    return null
  }
  getBoundingClientRect() {
    return { width: this.children[0]?.textContent?.length ? 96 : 0, height: 40 }
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this)
  }
}

const originalDocument = globalThis.document

afterEach(() => {
  Object.assign(globalThis, { document: originalDocument })
})

describe('board label measuring node', () => {
  test('measures an unmounted label with one reused node and removes it on disconnect', () => {
    const surface = new ElementStub()
    Object.assign(globalThis, { document: { createElement: () => new ElementStub() } })
    const decorations = new BoardDecorations(surface as unknown as HTMLElement, () => {})
    expect(decorations.measureLabel('First', 'ltr', 80, 2)).toEqual({ width: 48, height: 20 })
    expect(decorations.measureLabel('Second', 'rtl', undefined, 2)).toEqual({ width: 48, height: 20 })
    expect(surface.children).toHaveLength(1)
    decorations.disconnect()
    expect(surface.children).toHaveLength(0)
  })
})
