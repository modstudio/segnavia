import { describe, expect, test } from 'bun:test'
import type { Fill } from '@segnavia/format'
import { ItemSettingsController, type ItemSettingsErrorDetail } from './item-settings-authoring.ts'
import { isProvisionalFillId, provisionalFillId } from './item-settings-fills.ts'
import { ENGLISH_ITEM_SETTINGS_LABELS } from './item-settings-labels.ts'

function host(fills: Fill[] = [], fill: string | null = null) {
  const state = {
    fills,
    fill,
    labels: ENGLISH_ITEM_SETTINGS_LABELS,
    selects: [] as string[],
    refreshCount: 0,
    emitSelect(id: string) {
      state.selects.push(id)
    },
    refresh() {
      state.refreshCount++
    },
    disconnectAuthoring() {},
  }
  return state
}

describe('item settings authoring', () => {
  test('replaces a provisional fill with the host fill and selects it', async () => {
    const view = host()
    const created: Fill = { id: 'host-1', label: 'New fill', values: {} }
    const controller = new ItemSettingsController(view, {
      createFill: async () => created,
      saveFill: async () => {},
      deleteFill: async () => {},
    })
    const temp = { id: provisionalFillId(), label: 'New fill', values: {} }
    view.fills = [temp]
    view.fill = temp.id
    controller.create(temp)
    await controller.flush()
    expect(view.fills).toEqual([created])
    expect(view.fill).toBe('host-1')
    expect(view.selects).toEqual(['host-1'])
    expect(isProvisionalFillId(temp.id)).toBe(true)
  })

  test('rolls back a rejected create and emits authoring-error', async () => {
    const view = host()
    const errors: ItemSettingsErrorDetail[] = []
    const controller = new ItemSettingsController(view, {
      createFill: async () => {
        throw new Error('No')
      },
      saveFill: async () => {},
      deleteFill: async () => {},
    })
    controller.addEventListener('authoring-error', (event) => errors.push((event as CustomEvent<ItemSettingsErrorDetail>).detail))
    const temp = { id: provisionalFillId(), label: 'New fill', values: {} }
    view.fills = [temp]
    view.fill = temp.id
    controller.create(temp)
    await controller.flush()
    expect(view.fills).toEqual([])
    expect(view.fill).toBeNull()
    expect(errors).toMatchObject([{ operation: 'createFill', fillId: null, message: 'No' }])
  })

  test('defers save of a provisional fill until createFill returns a host id', async () => {
    const saved: Fill[] = []
    let release: (fill: Fill) => void = () => {}
    const view = host()
    const controller = new ItemSettingsController(view, {
      createFill: () => new Promise<Fill>((resolve) => (release = resolve)),
      saveFill: async (fill) => {
        saved.push(fill)
      },
      deleteFill: async () => {},
    })
    const temp = { id: provisionalFillId(), label: 'New fill', values: {} }
    view.fills = [temp]
    view.fill = temp.id
    controller.create(temp)
    controller.save({ ...temp, values: { name: 'Mina' } })
    expect(saved).toEqual([])
    release({ id: 'host-1', label: 'New fill', values: {} })
    await controller.flush()
    expect(saved).toEqual([{ id: 'host-1', label: 'New fill', values: { name: 'Mina' } }])
  })

  test('rolls back a rejected delete to the previous fills', async () => {
    const mina: Fill = { id: 'mina', values: { name: 'Mina' } }
    const noah: Fill = { id: 'noah', values: { name: 'Noah' } }
    const view = host([noah], 'noah')
    const errors: ItemSettingsErrorDetail[] = []
    const controller = new ItemSettingsController(view, {
      createFill: async () => mina,
      saveFill: async () => {},
      deleteFill: async () => {
        throw new Error('No')
      },
    })
    controller.addEventListener('authoring-error', (event) => errors.push((event as CustomEvent<ItemSettingsErrorDetail>).detail))
    await Promise.resolve(controller.delete('mina', [mina, noah], 'mina'))
    await controller.flush()
    expect(view.fills).toEqual([mina, noah])
    expect(view.fill).toBe('mina')
    expect(errors).toMatchObject([{ operation: 'deleteFill', fillId: 'mina', message: 'No' }])
  })
})
