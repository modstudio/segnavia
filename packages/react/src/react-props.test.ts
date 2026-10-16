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
})
