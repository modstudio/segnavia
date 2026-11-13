import { describe, expect, test } from 'bun:test'
import type { OutlineSource } from '@segnavia/format'
import { addMissingComposerHeadings, composerTagEntries, stripCloneIds, tagComposerHeadings } from './composer-tags.ts'

class FixtureElement {
  readonly attributes = new Map<string, string>()
  readonly children: FixtureElement[] = []
  parentNode: FixtureElement | null = null
  textContent = ''

  constructor(
    readonly tagName: string,
    attributes: Record<string, string> = {},
    readonly top = 0,
  ) {
    for (const [name, value] of Object.entries(attributes)) this.attributes.set(name, value)
  }

  append(...children: FixtureElement[]): this {
    for (const child of children) {
      child.parentNode = this
      this.children.push(child)
    }
    return this
  }

  prepend(child: FixtureElement): void {
    child.parentNode = this
    this.children.unshift(child)
  }

  insertBefore(child: FixtureElement, target: FixtureElement): void {
    child.parentNode = this
    this.children.splice(this.children.indexOf(target), 0, child)
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name)
  }

  matches(selector: string): boolean {
    return selector.split(',').includes(this.tagName)
  }

  querySelectorAll(selector: string): FixtureElement[] {
    const descendants = this.children.flatMap((child) => [child, ...child.querySelectorAll('*')])
    if (selector === '*') return descendants
    if (selector === '[id]') return descendants.filter((node) => node.getAttribute('id') !== null)
    return descendants.filter((node) => node.matches(selector))
  }

  querySelector(selector: string): FixtureElement | null {
    const id = /^\[id="(.*)"\]$/.exec(selector)?.[1]
    return id === undefined ? null : (this.querySelectorAll('[id]').find((node) => node.getAttribute('id') === id) ?? null)
  }

  getBoundingClientRect(): { top: number } {
    return { top: this.top }
  }
}

class FixtureDocument {
  constructor(readonly root: FixtureElement) {}

  querySelectorAll(selector: string): FixtureElement[] {
    return [this.root, ...this.root.querySelectorAll('*')].filter((node) => node.matches(selector))
  }

  getElementById(id: string): FixtureElement | null {
    return [this.root, ...this.root.querySelectorAll('*')].find((node) => node.getAttribute('id') === id) ?? null
  }

  createElement(tag: string): FixtureElement {
    return new FixtureElement(tag)
  }
}

const listed = { contents: true, outline: true }
const source = (direction: 'ltr' | 'rtl' = 'ltr'): OutlineSource => ({
  direction,
  depth: 6,
  blocks: ['chapter', 'one', 'three', 'unlisted'],
  headings: [
    { id: 'one', title: direction === 'rtl' ? 'פרק ראשון' : 'One', level: 1, listed, block: 'one' },
    { id: 'three', title: direction === 'rtl' ? 'סעיף שלישי' : 'Three', level: 3, listed, block: 'three' },
    { id: 'unlisted', title: direction === 'rtl' ? 'לא ברשימה' : 'Unlisted', level: 2, listed: { contents: true, outline: false }, block: 'unlisted' },
  ],
})

function composedFixture(direction: 'ltr' | 'rtl' = 'ltr') {
  const one = new FixtureElement('h1', { id: 'one' }).append()
  one.textContent = direction === 'rtl' ? 'פרק ראשון' : 'One'
  const oneBody = new FixtureElement('p')
  oneBody.textContent = direction === 'rtl' ? 'גוף הפרק הראשון' : 'Body after the first heading'
  const three = new FixtureElement('h3', { id: 'three' })
  three.textContent = direction === 'rtl' ? 'סעיף שלישי' : 'Three'
  const threeBody = new FixtureElement('p')
  threeBody.textContent = direction === 'rtl' ? 'גוף הסעיף השלישי' : 'Body after the third-rank heading'
  const unlisted = new FixtureElement('h2', { id: 'unlisted' })
  unlisted.textContent = direction === 'rtl' ? 'לא ברשימה' : 'Unlisted'
  const unlistedBody = new FixtureElement('p')
  unlistedBody.textContent = direction === 'rtl' ? 'גוף הכותרת שאינה ברשימה' : 'Body after the unlisted heading'
  const flow = new FixtureElement('section', { id: 'chapter', 'data-segnavia-flow': 'chapter' }).append(one, oneBody, three, threeBody, unlisted, unlistedBody)
  return { document: new FixtureDocument(flow), flow, one, three, unlisted }
}

describe('composer outline tags', () => {
  test('uses structural depths rather than heading ranks, including a right-to-left fixture (mutation: write rank instead of depth)', () => {
    for (const direction of ['ltr', 'rtl'] as const) {
      const fixture = composedFixture(direction)
      tagComposerHeadings(fixture.document as unknown as Document, composerTagEntries(source(direction)))
      expect(fixture.one.getAttribute('aria-level')).toBe('1')
      expect(fixture.three.getAttribute('aria-level')).toBe('2')
    }
  })

  test('removes an unlisted heading from heading semantics', () => {
    const fixture = composedFixture()
    tagComposerHeadings(fixture.document as unknown as Document, composerTagEntries(source()))
    expect(fixture.unlisted.getAttribute('role')).toBe('none')
  })

  test('leaves heading semantics unchanged without an outline (mutation: always run tagComposerHeadings)', () => {
    const fixture = composedFixture()
    const entries = composerTagEntries(undefined)
    if (entries) tagComposerHeadings(fixture.document as unknown as Document, entries)
    expect(fixture.one.getAttribute('role')).toBeNull()
    expect(fixture.one.getAttribute('aria-level')).toBeNull()
    expect(fixture.unlisted.getAttribute('role')).toBeNull()
    expect(fixture.unlisted.getAttribute('aria-level')).toBeNull()
  })

  test('adds a direction-isolated hidden heading for a titled part with no heading block', () => {
    const fixture = composedFixture('rtl')
    const outline: OutlineSource = {
      ...source('rtl'),
      blocks: ['chapter', ...source('rtl').blocks],
      headings: [{ id: 'chapter', title: 'חלק ראשון', level: 1, listed, block: 'chapter' }, ...source('rtl').headings],
    }
    const entries = composerTagEntries(outline)
    tagComposerHeadings(fixture.document as unknown as Document, entries)
    addMissingComposerHeadings(fixture.flow as unknown as Element, fixture.document as unknown as Document, 'chapter', true, entries)
    const heading = fixture.flow.children[0]
    expect(heading?.getAttribute('role')).toBe('heading')
    expect(heading?.getAttribute('aria-level')).toBe('1')
    expect(heading?.getAttribute('dir')).toBe('rtl')
    expect(heading?.textContent).toBe('חלק ראשון')
  })

  test('adds a flow-root hidden heading only to its opening window (mutation: drop the opening condition)', () => {
    const fixture = composedFixture()
    const outline: OutlineSource = {
      ...source(),
      blocks: ['chapter', ...source().blocks],
      headings: [{ id: 'chapter', title: 'Part One', level: 1, listed, block: 'chapter' }, ...source().headings],
    }
    const entries = composerTagEntries(outline)
    const opening = new FixtureElement('section')
    const continuation = new FixtureElement('section')
    addMissingComposerHeadings(opening as unknown as Element, fixture.document as unknown as Document, 'chapter', true, entries)
    addMissingComposerHeadings(continuation as unknown as Element, fixture.document as unknown as Document, 'chapter', false, entries)
    const hidden = [...opening.children, ...continuation.children].filter((node) => node.getAttribute('data-segnavia-outline-heading') !== null)
    expect(hidden).toHaveLength(1)
    expect(opening.children).toHaveLength(1)
    expect(continuation.children).toHaveLength(0)
  })

  test('hides a non-home clone when it drops the source id', () => {
    const sourceHeading = new FixtureElement('h2', { id: 'continued' }, 120)
    const clone = new FixtureElement('h2', { id: 'continued' }, 0)
    stripCloneIds(clone as unknown as Element, sourceHeading as unknown as Element, 0, 100, 0, (element) => [
      { top: (element as unknown as FixtureElement).top },
    ])
    expect(clone.getAttribute('id')).toBeNull()
    expect(clone.getAttribute('aria-hidden')).toBe('true')
  })
})
