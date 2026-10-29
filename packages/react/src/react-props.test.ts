import { describe, expect, test } from 'bun:test'
import { ELEMENTS } from './elements.ts'
import { syncElementProps } from './react-props.ts'

class FakeElement extends EventTarget {
  labels: unknown
  attributes = new Map<string, string>()
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value)
  }
  removeAttribute(name: string) {
    this.attributes.delete(name)
  }
}

describe('React element prop wiring', () => {
  test('updates properties and attributes after construction', () => {
    const element = new FakeElement()
    syncElementProps(ELEMENTS.player, element as unknown as HTMLElement, { labels: { play: 'Start' }, rail: true, transitionDuration: 300 }, {})
    expect(element.labels).toEqual({ play: 'Start' })
    expect(element.attributes).toEqual(
      new Map([
        ['rail', ''],
        ['transition-duration', '300'],
      ]),
    )
    syncElementProps(ELEMENTS.player, element as unknown as HTMLElement, { labels: { play: 'Go' }, rail: false }, { rail: true, transitionDuration: 300 })
    expect(element.labels).toEqual({ play: 'Go' })
    expect(element.attributes.size).toBe(0)
  })

  test('turns on callbacks into event listeners and cleans them up', () => {
    const element = new FakeElement()
    let changes = 0
    const cleanup = syncElementProps(ELEMENTS.player, element as unknown as HTMLElement, { onChange: () => changes++ }, {})
    element.dispatchEvent(new Event('change'))
    cleanup()
    element.dispatchEvent(new Event('change'))
    expect(changes).toBe(1)
  })

  test('uses the element descriptor for custom event names', () => {
    const element = new FakeElement()
    let labels = 0
    const cleanup = syncElementProps(ELEMENTS.player, element as unknown as HTMLElement, { onSegnaviaLabels: () => labels++ }, {})
    element.dispatchEvent(new Event('segnavia-labels'))
    cleanup()
    element.dispatchEvent(new Event('segnavia-labels'))
    expect(labels).toBe(1)
  })

  test('reflects the page bounded boolean as an attribute', () => {
    const element = new FakeElement()
    syncElementProps(ELEMENTS.page, element as unknown as HTMLElement, { bounded: true }, {})
    expect(element.attributes.get('bounded')).toBe('')
    syncElementProps(ELEMENTS.page, element as unknown as HTMLElement, { bounded: false }, { bounded: true })
    expect(element.attributes.has('bounded')).toBe(false)
  })

  test('reflects the page label as an attribute', () => {
    const element = new FakeElement()
    syncElementProps(ELEMENTS.page, element as unknown as HTMLElement, { label: 'Notice' }, {})
    expect(element.attributes.get('label')).toBe('Notice')
    syncElementProps(ELEMENTS.page, element as unknown as HTMLElement, { label: undefined }, { label: 'Notice' })
    expect(element.attributes.has('label')).toBe(false)
  })

  test.each([
    [ELEMENTS.page, 'page'],
    [ELEMENTS.thumbnail, 'page'],
    [ELEMENTS.thumbnail, 'print'],
    [ELEMENTS.document, 'pages'],
    [ELEMENTS.document, 'print'],
    [ELEMENTS.page, 'motifs'],
    [ELEMENTS.paper, 'motifs'],
    [ELEMENTS.thumbnail, 'motifs'],
    [ELEMENTS.document, 'motifs'],
    [ELEMENTS.page, 'fonts'],
    [ELEMENTS.paper, 'fonts'],
    [ELEMENTS.thumbnail, 'fonts'],
    [ELEMENTS.document, 'fonts'],
  ] as const)('removes and replaces the %s object property', (descriptor, property) => {
    const element = new FakeElement() as unknown as HTMLElement & Record<string, unknown>
    const first = { value: 1 }
    const replacement = { value: 2 }
    syncElementProps(descriptor, element, { [property]: first }, {})
    expect(element[property]).toBe(first)
    syncElementProps(descriptor, element, {}, { [property]: first })
    expect(element[property]).toBeUndefined()
    syncElementProps(descriptor, element, { [property]: replacement }, {})
    expect(element[property]).toBe(replacement)
  })
})
