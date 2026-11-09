import type { Fill, SlotDeclaration, SlotValue, TextDirection } from '@segnavia/format'
import type { ItemSettingsLabels } from './item-settings-labels.ts'
import type { SlotFieldView } from './item-settings-values.ts'

export type ItemSettingsActionKind = 'override' | 'use-source' | 'design-only'
interface ControlView {
  dir: TextDirection
  labels: ItemSettingsLabels
}
export interface FillSwitcherView extends ControlView {
  fills: readonly Fill[]
  fill: string | null
}
export interface ItemSettingsFieldView extends ControlView, SlotFieldView {
  declaration: SlotDeclaration
}
export interface ItemSettingsActionView extends ItemSettingsFieldView {
  action: ItemSettingsActionKind
}
export interface FillSwitcherCallbacks {
  onSelect(id: string): void
  onRename(label: string): void
  onAdd(): void
  onRemove(): void
}
export interface FieldControlCallbacks {
  onChange(value: SlotValue | undefined): void
}
export interface AssetControlCallbacks extends FieldControlCallbacks {
  pickAsset(): Promise<void>
}
export interface ActionControlCallbacks {
  onActivate(enabled?: boolean): void
}
export interface ItemSettingsRenderedControl<View> {
  element: HTMLElement
  update(view: View): void
  dispose(): void
}
export type ItemSettingsControlRenderer<View, Callbacks> = (view: View, callbacks: Callbacks) => ItemSettingsRenderedControl<View>
export interface ItemSettingsControls {
  fillSwitcher?: ItemSettingsControlRenderer<FillSwitcherView, FillSwitcherCallbacks>
  field?: ItemSettingsControlRenderer<ItemSettingsFieldView, FieldControlCallbacks>
  asset?: ItemSettingsControlRenderer<ItemSettingsFieldView, AssetControlCallbacks>
  action?: ItemSettingsControlRenderer<ItemSettingsActionView, ActionControlCallbacks>
}

function isolated(text: string): HTMLElement {
  const bdi = document.createElement('bdi')
  bdi.textContent = text
  return bdi
}

export const nativeFillSwitcher: NonNullable<ItemSettingsControls['fillSwitcher']> = (initial, callbacks) => {
  const root = document.createElement('div')
  root.part.add('fills')
  const selectLabel = document.createElement('label')
  const selectCaption = document.createElement('span')
  const select = document.createElement('select')
  select.part.add('fill-select')
  select.addEventListener('change', () => callbacks.onSelect(select.value))
  selectLabel.append(selectCaption, select)
  const nameLabel = document.createElement('label')
  const nameCaption = document.createElement('span')
  const name = document.createElement('input')
  name.part.add('fill-label')
  name.dir = 'auto'
  name.addEventListener('input', () => callbacks.onRename(name.value))
  nameLabel.append(nameCaption, name)
  const add = document.createElement('button')
  add.type = 'button'
  add.dataset.action = 'add'
  add.part.add('fill-add')
  add.addEventListener('click', callbacks.onAdd)
  const remove = document.createElement('button')
  remove.type = 'button'
  remove.dataset.action = 'remove'
  remove.part.add('fill-remove')
  remove.addEventListener('click', callbacks.onRemove)
  root.append(selectLabel, nameLabel, add, remove)
  const update = (view: FillSwitcherView) => {
    selectCaption.replaceChildren(isolated(view.labels.fills))
    select.replaceChildren(
      ...view.fills.map((fill) => {
        const option = document.createElement('option')
        option.value = fill.id
        option.textContent = fill.label || fill.id
        return option
      }),
    )
    select.value = view.fill ?? ''
    const current = view.fills.find((fill) => fill.id === view.fill)
    nameCaption.replaceChildren(isolated(view.labels.fillName))
    name.value = current?.label ?? ''
    name.disabled = current === undefined
    add.replaceChildren(isolated(view.labels.addFill))
    add.dir = 'auto'
    remove.replaceChildren(isolated(view.labels.removeFill))
    remove.dir = 'auto'
    remove.disabled = view.fill === null
  }
  update(initial)
  return { element: root, update, dispose() {} }
}

const INPUT_TYPE = { text: 'text', phone: 'tel', email: 'email', link: 'url', qr: 'url' } as const
export const nativeField: NonNullable<ItemSettingsControls['field']> = (initial, callbacks) => {
  const input = document.createElement('input')
  input.part.add('slot-input')
  input.addEventListener('input', () => callbacks.onChange(input.value))
  const update = (view: ItemSettingsFieldView) => {
    input.type = INPUT_TYPE[view.type as keyof typeof INPUT_TYPE]
    input.dir = 'auto'
    input.value = view.text
    input.readOnly = view.readOnly
    input.required = view.required
    input.setAttribute('aria-required', String(view.required))
    if (view.readOnly) input.setAttribute('aria-readonly', 'true')
    else input.removeAttribute('aria-readonly')
  }
  update(initial)
  return { element: input, update, dispose() {} }
}

function nativeAssetControl(initial: ItemSettingsFieldView, callbacks: AssetControlCallbacks, canPick: boolean) {
  const root = document.createElement('div')
  const file = document.createElement('input')
  file.type = 'file'
  file.accept = 'image/*'
  file.part.add('asset-file')
  file.addEventListener('change', () => readImageFile(file, callbacks.onChange))
  const chosen = document.createElement('span')
  const pick = document.createElement('button')
  pick.type = 'button'
  pick.dataset.action = 'pick-asset'
  pick.part.add('asset-pick')
  pick.addEventListener('click', () => void callbacks.pickAsset())
  root.append(file)
  const update = (view: ItemSettingsFieldView) => {
    file.disabled = view.readOnly
    file.required = view.required
    file.setAttribute('aria-required', String(view.required))
    if (typeof view.value === 'object') {
      chosen.dataset.asset = view.value.asset
      chosen.replaceChildren(isolated(view.value.asset))
      if (!chosen.isConnected) root.append(chosen)
    } else chosen.remove()
    if (canPick && !view.readOnly) {
      pick.replaceChildren(isolated(view.labels.chooseAsset))
      pick.dir = 'auto'
      if (!pick.isConnected) root.append(pick)
    } else pick.remove()
  }
  update(initial)
  return { element: root, update, dispose() {} }
}

export const nativeAsset: NonNullable<ItemSettingsControls['asset']> = (initial, callbacks) => nativeAssetControl(initial, callbacks, true)
export const nativeAssetWithoutPicker: NonNullable<ItemSettingsControls['asset']> = (initial, callbacks) => nativeAssetControl(initial, callbacks, false)

export const nativeAction: NonNullable<ItemSettingsControls['action']> = (initial, callbacks) => {
  if (initial.action === 'design-only') {
    const label = document.createElement('label')
    label.part.add('design-only')
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.part.add('slot-action')
    input.dataset.action = 'design-only'
    input.addEventListener('change', () => callbacks.onActivate(input.checked))
    const caption = document.createElement('span')
    label.append(input, caption)
    const update = (view: ItemSettingsActionView) => {
      label.dataset.designOnly = String(view.designOnly)
      input.checked = view.designOnly
      caption.replaceChildren(isolated(view.labels.designOnly))
    }
    update(initial)
    return { element: label, update, dispose() {} }
  }
  const button = document.createElement('button')
  button.type = 'button'
  button.part.add('slot-action')
  button.addEventListener('click', () => callbacks.onActivate())
  const update = (view: ItemSettingsActionView) => {
    button.replaceChildren(isolated(view.action === 'override' ? view.labels.override : view.labels.useSource))
    button.dir = 'auto'
  }
  update(initial)
  return { element: button, update, dispose() {} }
}

function readImageFile(input: HTMLInputElement, onChange: (value: SlotValue) => void) {
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.addEventListener('load', () => {
    if (typeof reader.result === 'string') onChange(reader.result)
  })
  reader.readAsDataURL(file)
}
