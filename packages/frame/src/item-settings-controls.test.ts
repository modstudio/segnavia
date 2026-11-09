import { expect, test } from 'bun:test'
import type { SlotValue } from '@segnavia/format'
import type {
  ActionControlCallbacks,
  AssetControlCallbacks,
  FieldControlCallbacks,
  FillSwitcherCallbacks,
  ItemSettingsControls,
  ItemSettingsRenderedControl,
} from './item-settings-controls.ts'
import { type FieldsActions, FieldsPanel } from './item-settings-fields.ts'
import { ENGLISH_ITEM_SETTINGS_LABELS } from './item-settings-labels.ts'
import type { ItemSettingsSectionContext } from './item-settings-section.ts'
import { ItemSettingsTestElement, installItemSettingsTestDocument } from './item-settings-test-document.test-helper.ts'

installItemSettingsTestDocument()

function context(): ItemSettingsSectionContext {
  return {
    declarations: [
      { key: 'name', label: 'Name', type: 'text', required: false },
      { key: 'picture', label: 'Picture', type: 'image', required: false },
    ],
    fills: [{ id: 'mina', label: 'Mina', values: { picture: { asset: 'old' } } }],
    fill: 'mina',
    overrides: {},
    source: { id: 'source', values: { name: 'Source name' } },
    report: undefined,
    labels: ENGLISH_ITEM_SETTINGS_LABELS,
    dir: 'ltr',
  }
}

function actions(changes: Array<[string, SlotValue | undefined]>): FieldsActions {
  return {
    pickAsset: async () => ({ asset: 'picked' }),
    onSelectFill() {},
    onAddFill() {},
    onRemoveFill() {},
    onRenameFill() {},
    onChangeValue: (key, value) => changes.push([key, value]),
    onDesignOnly() {},
    onOverride() {},
    onUseSource() {},
  }
}

function rendered<View>(element: ItemSettingsTestElement, updates: View[]): ItemSettingsRenderedControl<View> {
  return { element: element as unknown as HTMLElement, update: (view) => updates.push(view), dispose() {} }
}

test('host renderers replace every control kind and receive working callbacks', async () => {
  const calls: string[] = []
  const changes: Array<[string, SlotValue | undefined]> = []
  let fillCallbacks: FillSwitcherCallbacks | undefined
  let fieldCallbacks: FieldControlCallbacks | undefined
  let assetCallbacks: AssetControlCallbacks | undefined
  let canPickAsset: boolean | undefined
  const actionCallbacks = new Map<string, ActionControlCallbacks>()
  const hostElements = new Map<string, ItemSettingsTestElement>()
  const controls: ItemSettingsControls = {
    fillSwitcher(_view, callbacks) {
      fillCallbacks = callbacks
      return rendered(new ItemSettingsTestElement(), [])
    },
    field(_view, callbacks) {
      fieldCallbacks = callbacks
      const element = new ItemSettingsTestElement()
      hostElements.set('field', element)
      return rendered(element, [])
    },
    asset(view, callbacks) {
      assetCallbacks = callbacks
      canPickAsset = view.canPickAsset
      const element = new ItemSettingsTestElement()
      hostElements.set('asset', element)
      return rendered(element, [])
    },
    action(view, callbacks) {
      actionCallbacks.set(`${view.key}:${view.action}`, callbacks)
      const element = new ItemSettingsTestElement()
      hostElements.set(`${view.key}:${view.action}`, element)
      return rendered(element, [])
    },
  }
  const panel = new FieldsPanel(new ItemSettingsTestElement() as unknown as HTMLElement)
  const handlers = actions(changes)
  handlers.onSelectFill = (id) => calls.push(`select:${id}`)
  handlers.onRenameFill = (label) => calls.push(`rename:${label}`)
  handlers.onAddFill = () => calls.push('add')
  handlers.onRemoveFill = () => calls.push('remove')
  handlers.onOverride = (key) => calls.push(`override:${key}`)
  handlers.onDesignOnly = (key, enabled) => calls.push(`design:${key}:${enabled}`)
  panel.update(context(), handlers, controls)

  expect(hostElements.get('field')?.dataset.slot).toBe('name')
  expect(hostElements.get('asset')?.dataset.slot).toBe('picture')
  expect(canPickAsset).toBeTrue()
  expect(hostElements.get('name:override')?.dataset).toEqual({ slot: 'name', action: 'override' })

  fillCallbacks?.onSelect('mina')
  fillCallbacks?.onRename('Renamed')
  fillCallbacks?.onAdd()
  fillCallbacks?.onRemove()
  fieldCallbacks?.onChange('Changed')
  assetCallbacks?.onChange({ asset: 'uploaded' })
  await assetCallbacks?.pickAsset()
  actionCallbacks.get('name:override')?.onActivate()
  actionCallbacks.get('name:design-only')?.onActivate(true)

  const withHandValue = context()
  withHandValue.fills = [{ id: 'mina', values: { name: 'Hand name', picture: { asset: 'old' } } }]
  panel.update(withHandValue, handlers, controls)
  handlers.onUseSource = (key) => calls.push(`source:${key}`)
  actionCallbacks.get('name:use-source')?.onActivate()

  expect(calls).toEqual(['select:mina', 'rename:Renamed', 'add', 'remove', 'override:name', 'design:name:true', 'source:name'])
  expect(changes).toEqual([
    ['name', 'Changed'],
    ['picture', { asset: 'uploaded' }],
    ['picture', { asset: 'picked' }],
  ])
})

test('a keyed control is updated in place, keeps focus, and is disposed when its slot disappears', () => {
  const updates: string[] = []
  let creates = 0
  let disposes = 0
  let element: ItemSettingsTestElement | undefined
  const controls: ItemSettingsControls = {
    field(_view) {
      creates += 1
      element = new ItemSettingsTestElement()
      return {
        element: element as unknown as HTMLElement,
        update: (next) => updates.push(next.text),
        dispose: () => {
          disposes += 1
        },
      }
    },
  }
  const panel = new FieldsPanel(new ItemSettingsTestElement() as unknown as HTMLElement)
  const first = context()
  panel.update(first, actions([]), controls)
  element?.focus()
  const second = context()
  second.fills = [{ id: 'mina', values: { name: 'Next' } }]
  second.source = undefined
  panel.update(second, actions([]), controls)

  expect(creates).toBe(1)
  expect(updates).toEqual(['Next'])
  expect(document.activeElement).toBe(element as unknown as Element)

  const replacement: NonNullable<ItemSettingsControls['field']> = () => ({
    element: new ItemSettingsTestElement() as unknown as HTMLElement,
    update() {},
    dispose: () => {
      disposes += 1
    },
  })
  const replacementControls = { field: replacement }
  panel.update(second, actions([]), replacementControls)
  expect(disposes).toBe(1)

  second.declarations = second.declarations.filter((slot) => slot.key !== 'name')
  panel.update(second, actions([]), replacementControls)
  expect(disposes).toBe(2)
})

test('default native controls expose every documented part', () => {
  const container = new ItemSettingsTestElement()
  new FieldsPanel(container as unknown as HTMLElement).update(context(), actions([]))
  const parts = descendants(container).flatMap((element) => [...element.part])
  for (const part of ['fill-select', 'fill-label', 'fill-add', 'fill-remove', 'slot-input', 'asset-file', 'asset-pick', 'slot-action']) {
    expect(parts).toContain(part)
  }
})

test('the default asset picker stays absent when the host supplies no picker', () => {
  const container = new ItemSettingsTestElement()
  const handlers = actions([])
  handlers.pickAsset = undefined
  new FieldsPanel(container as unknown as HTMLElement).update(context(), handlers)
  const parts = descendants(container).flatMap((element) => [...element.part])
  expect(parts).not.toContain('asset-pick')
})

test('the default asset control keeps file, chosen asset, picker order across value changes', () => {
  const container = new ItemSettingsTestElement()
  const panel = new FieldsPanel(container as unknown as HTMLElement)
  const first = context()
  panel.update(first, actions([]))
  const file = descendants(container).find((element) => element.part.has('asset-file'))
  const root = file?.parentNode
  expect(root?.children.map((element) => (element.part.has('asset-file') ? 'file' : element.part.has('asset-pick') ? 'pick' : 'chosen'))).toEqual([
    'file',
    'chosen',
    'pick',
  ])

  const cleared = context()
  cleared.fills = [{ id: 'mina', values: {} }]
  panel.update(cleared, actions([]))
  panel.update(first, actions([]))

  expect(root?.children.map((element) => (element.part.has('asset-file') ? 'file' : element.part.has('asset-pick') ? 'pick' : 'chosen'))).toEqual([
    'file',
    'chosen',
    'pick',
  ])
})

function descendants(element: ItemSettingsTestElement): ItemSettingsTestElement[] {
  return element.children.flatMap((child) => [child, ...descendants(child)])
}
