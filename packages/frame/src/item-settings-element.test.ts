import { describe, expect, test } from 'bun:test'
import type { Fill } from '@segnavia/format'
import type { ItemSettingsControls } from './item-settings-controls.ts'
import { ItemSettingsTestElement, installItemSettingsTestDocument } from './item-settings-test-document.test-helper.ts'

installItemSettingsTestDocument()

const { ItemSettingsController } = await import('./item-settings-authoring.ts')
const freshElementModule = './item-settings-element.ts?fresh'
const { SegnaviaItemSettings } = (await import(freshElementModule)) as typeof import('./item-settings-element.ts')

const original: Fill = { id: 'mina', values: { name: 'Mina' } }
const other: Fill = { id: 'noah', values: { name: 'Noah' } }

function setup(saveFill: (fill: Fill) => Promise<void>, saveOverrides?: (values: Fill['values']) => Promise<void>) {
  const element = new SegnaviaItemSettings()
  element.declarations = [{ key: 'name', label: 'Name', type: 'text', required: false }]
  element.fills = [original, other]
  element.fill = original.id
  const controller = new ItemSettingsController(element, {
    createFill: async () => original,
    saveFill,
    saveOverrides,
    deleteFill: async () => {},
  })
  element.connectAuthoring(controller)
  return { element, controller }
}

function toggleNameDesignOnly(element: InstanceType<typeof SegnaviaItemSettings>, enabled: boolean) {
  ;(element as unknown as { toggleDesignOnly(key: string, enabled: boolean): void }).toggleDesignOnly('name', enabled)
}

function typeName(element: InstanceType<typeof SegnaviaItemSettings>, name: string) {
  ;(element as unknown as { changeValue(key: string, value: string): void }).changeValue('name', name)
}

test('emits each edited fill before the debounced save', async () => {
  const order: Array<Fill | 'save'> = []
  const { element, controller } = setup(async () => {
    order.push('save')
  })
  const events: CustomEvent<Fill>[] = []
  element.addEventListener('segnavia-fill-input', (event) => {
    events.push(event as CustomEvent<Fill>)
    order.push((event as CustomEvent<Fill>).detail)
  })

  typeName(element, 'M')
  typeName(element, 'Mina Patel')

  expect(events.map((event) => event.detail)).toEqual([
    { id: 'mina', values: { name: 'M' } },
    { id: 'mina', values: { name: 'Mina Patel' } },
  ])
  expect(events.every((event) => event.bubbles && event.composed)).toBeTrue()
  expect(order).toHaveLength(2)

  await controller.flush()
  expect(order).toEqual([{ id: 'mina', values: { name: 'M' } }, { id: 'mina', values: { name: 'Mina Patel' } }, 'save'])
})

test('does not emit an edited fill while its host id is pending', () => {
  const element = new SegnaviaItemSettings()
  element.fills = [original]
  element.fill = original.id
  const controller = new ItemSettingsController(element, {
    createFill: () => new Promise<Fill>(() => {}),
    saveFill: async () => {},
    deleteFill: async () => {},
  })
  element.connectAuthoring(controller)
  const inputs: Fill[] = []
  element.addEventListener('segnavia-fill-input', (event) => inputs.push((event as CustomEvent<Fill>).detail))

  ;(element as unknown as { addNewFill(): void }).addNewFill()
  typeName(element, 'Provisional name')
  expect(inputs).toEqual([])

  element.fill = original.id
  typeName(element, 'Host name')
  expect(inputs).toEqual([{ id: 'mina', values: { name: 'Host name' } }])
  controller.detach()
})

test('routes design-only edits to overrides and clearing the override reveals the unchanged fill', async () => {
  const fills: Fill[] = []
  const overrides: Fill['values'][] = []
  const { element, controller } = setup(
    async (fill) => {
      fills.push(fill)
    },
    async (values) => {
      overrides.push(values)
    },
  )

  toggleNameDesignOnly(element, true)
  expect(element.overrides).toEqual({ name: 'Mina' })
  expect(element.fills[0]).toEqual(original)
  typeName(element, 'Design Mina')
  await controller.flush()

  expect(fills).toEqual([])
  expect(overrides).toEqual([{ name: 'Design Mina' }])
  expect(element.fills[0]).toEqual(original)

  toggleNameDesignOnly(element, false)
  expect(element.overrides).toEqual({})
  expect(element.fills[0]?.values.name).toBe('Mina')
  await controller.flush()
  expect(overrides).toEqual([{ name: 'Design Mina' }, {}])

  typeName(element, 'Fill Mina')
  await controller.flush()
  expect(fills).toEqual([{ id: 'mina', values: { name: 'Fill Mina' } }])
  expect(overrides).toEqual([{ name: 'Design Mina' }, {}])
})

test('routes an edit to the fill when an override is present but cannot be saved', async () => {
  const fills: Fill[] = []
  const { element, controller } = setup(async (fill) => {
    fills.push(fill)
  })
  element.overrides = { name: 'Design Mina' }
  const inputs: Fill[] = []
  element.addEventListener('segnavia-fill-input', (event) => inputs.push((event as CustomEvent<Fill>).detail))

  typeName(element, 'Fill Mina')
  await controller.flush()

  expect(fills).toEqual([{ id: 'mina', values: { name: 'Fill Mina' } }])
  expect(inputs).toEqual([{ id: 'mina', values: { name: 'Fill Mina' } }])
  expect(element.overrides).toEqual({ name: 'Design Mina' })
})

test('the controls property replaces a native control and a new renderer replaces the host control', () => {
  const element = new SegnaviaItemSettings()
  element.declarations = [{ key: 'name', label: 'Name', type: 'text', required: false }]
  let disposed = 0
  const first = new ItemSettingsTestElement('input')
  const firstRenderer: NonNullable<ItemSettingsControls['field']> = () => ({
    element: first as unknown as HTMLElement,
    update() {},
    dispose: () => {
      disposed += 1
    },
  })
  element.connectedCallback()
  element.controls = { field: firstRenderer }

  expect(first.dataset.slot).toBe('name')
  expect(first.parentNode).not.toBeNull()

  const second = new ItemSettingsTestElement('input')
  element.controls = { field: () => ({ element: second as unknown as HTMLElement, update() {}, dispose() {} }) }

  expect(disposed).toBe(1)
  expect(first.parentNode).toBeNull()
  expect(second.dataset.slot).toBe('name')
})

test('disconnect disposes host controls and reconnect creates them again', () => {
  const element = new SegnaviaItemSettings()
  element.declarations = [{ key: 'name', label: 'Name', type: 'text', required: false }]
  let creates = 0
  let disposes = 0
  element.controls = {
    field: () => {
      creates += 1
      return {
        element: new ItemSettingsTestElement('input') as unknown as HTMLElement,
        update() {},
        dispose: () => {
          disposes += 1
        },
      }
    },
  }
  element.connectedCallback()

  element.disconnectedCallback()
  expect(disposes).toBe(1)

  element.connectedCallback()
  expect(creates).toBe(2)
})

test('a host section keeps input focus and selection across a render', () => {
  const element = new SegnaviaItemSettings()
  let input: ItemSettingsTestElement | undefined
  element.addSection({
    id: 'host',
    label: 'Host',
    render(container) {
      input = new ItemSettingsTestElement('input')
      input.part.add('host-control')
      input.dataset.action = 'edit'
      container.append(input as unknown as HTMLElement)
    },
  })
  element.connectedCallback()
  input?.focus()
  input?.setSelectionRange(2, 4)
  const previous = input

  element.fills = [original]

  expect(input).not.toBe(previous)
  expect(document.activeElement).toBe(input as unknown as Element)
  expect(input?.selectionStart).toBe(2)
  expect(input?.selectionEnd).toBe(4)
})

describe('item settings host refreshes', () => {
  test('keeps a design draft and adopts a host override after its save settles', async () => {
    const { element, controller } = setup(
      async () => {},
      async () => {},
    )
    toggleNameDesignOnly(element, true)
    typeName(element, 'Design draft')

    element.overrides = { name: 'Host design' }
    expect(element.overrides).toEqual({ name: 'Design draft' })

    await controller.flush()
    expect(element.overrides).toEqual({ name: 'Host design' })
  })

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

  test('keeps a fill that is still being created across a host refresh, and shows it once created', async () => {
    let finishCreate: (fill: Fill) => void = () => {}
    const element = new SegnaviaItemSettings()
    element.fills = [original]
    element.fill = original.id
    const controller = new ItemSettingsController(element, {
      createFill: () =>
        new Promise<Fill>((resolve) => {
          finishCreate = resolve
        }),
      saveFill: async () => {},
      deleteFill: async () => {},
    })
    element.connectAuthoring(controller)
    ;(element as unknown as { addNewFill(): void }).addNewFill()
    expect(element.fills).toHaveLength(2)

    element.fills = [original]
    expect(element.fills).toHaveLength(2)

    finishCreate({ id: 'created', label: 'New', values: {} })
    await controller.flush()
    expect(element.fills.map((fill) => fill.id)).toEqual(['mina', 'created'])
  })

  test('a detached controller writes nothing back when a save it started settles', async () => {
    let finishSave: () => void = () => {}
    const { element, controller } = setup(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve
        }),
    )
    typeName(element, 'Mina Patel')
    const flushing = controller.flush()
    // flush starts the save a tick later; wait until it is in flight.
    await new Promise((resolve) => setTimeout(resolve, 0))
    element.fills = [{ ...original, values: { name: 'Host H' } }, other]

    controller.detach()
    element.fills = [{ ...original, values: { name: 'After detach' } }, other]
    finishSave()
    await flushing

    expect(element.fills[0]?.values.name).toBe('After detach')
  })
})
