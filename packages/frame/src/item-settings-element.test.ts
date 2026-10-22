import { afterAll, describe, expect, test } from 'bun:test'
import type { Fill } from '@segnavia/format'

class TestElement extends EventTarget {
  children: TestElement[] = []
  part = { add() {} }

  attachShadow() {
    return new TestElement()
  }

  append(...nodes: TestElement[]) {
    this.children.push(...nodes)
  }
}

// Both globals are process-wide under bun test, and a later file's helper may
// already have installed its own document; put the previous ones back.
const previousHTMLElement = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement')
const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
afterAll(() => {
  for (const [name, previous] of [
    ['HTMLElement', previousHTMLElement],
    ['document', previousDocument],
  ] as const) {
    if (previous) Object.defineProperty(globalThis, name, previous)
    else Reflect.deleteProperty(globalThis, name)
  }
})

Object.assign(globalThis, { HTMLElement: TestElement })
Object.defineProperty(globalThis, 'document', {
  configurable: true,
  writable: true,
  value: { createElement: () => new TestElement() },
})

const { ItemSettingsController } = await import('./item-settings-authoring.ts')
const { SegnaviaItemSettings } = await import('./item-settings-element.ts')

const original: Fill = { id: 'mina', values: { name: 'Mina' } }
const other: Fill = { id: 'noah', values: { name: 'Noah' } }

function setup(saveFill: (fill: Fill) => Promise<void>) {
  const element = new SegnaviaItemSettings()
  element.fills = [original, other]
  element.fill = original.id
  const controller = new ItemSettingsController(element, {
    createFill: async () => original,
    saveFill,
    deleteFill: async () => {},
  })
  element.connectAuthoring(controller)
  return { element, controller }
}

function typeName(element: InstanceType<typeof SegnaviaItemSettings>, name: string) {
  ;(element as unknown as { changeValue(key: string, value: string): void }).changeValue('name', name)
}

describe('item settings host refreshes', () => {
  test('keeps a typed draft while its save is debouncing', () => {
    const { element } = setup(async () => {})
    typeName(element, 'Mina Patel')

    element.fills = [original, { ...other, values: { name: 'Noah Host' } }]

    expect(element.fills).toEqual([
      { id: 'mina', values: { name: 'Mina Patel' } },
      { id: 'noah', values: { name: 'Noah Host' } },
    ])
  })

  test('adopts a host value received while its save is debouncing once the save settles', async () => {
    const { element, controller } = setup(async () => {})
    typeName(element, 'Mina Patel')

    element.fills = [{ id: 'mina', values: { name: 'Older Host' } }, other]
    element.fills = [{ id: 'mina', values: { name: 'Mina Host' } }, other]
    expect(element.fills[0]).toEqual({ id: 'mina', values: { name: 'Mina Patel' } })

    await controller.flush()
    expect(element.fills[0]).toEqual({ id: 'mina', values: { name: 'Mina Host' } })
  })

  test('adopts a host value received while its save is in flight once the save settles', async () => {
    let release = () => {}
    const { element, controller } = setup(() => new Promise<void>((resolve) => (release = resolve)))
    typeName(element, 'Mina Patel')
    const saving = controller.flush()
    await Promise.resolve()

    element.fills = [{ id: 'mina', values: { name: 'Mina Host' } }, other]
    expect(element.fills[0]).toEqual({ id: 'mina', values: { name: 'Mina Patel' } })

    release()
    await saving
    expect(element.fills[0]).toEqual({ id: 'mina', values: { name: 'Mina Host' } })
  })

  test('never saves a fill the host stops listing', async () => {
    const saved: string[] = []
    const { element, controller } = setup(async (fill) => {
      saved.push(fill.id)
    })
    typeName(element, 'Mina Patel')

    element.fills = [other]
    await controller.flush()

    expect(element.fills).toEqual([other])
    expect(saved).toEqual([])
  })
})
