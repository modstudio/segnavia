import type { Fill, SlotDeclaration, SlotValue } from '@segnavia/format'
import { fillLabel, selectedFill } from './item-settings-fills.ts'
import type { ItemSettingsLabels } from './item-settings-labels.ts'
import type { ItemSettingsSectionContext } from './item-settings-section.ts'
import { type SlotFieldView, slotFieldView } from './item-settings-values.ts'

const INPUT_TYPE = { text: 'text', phone: 'tel', email: 'email', link: 'url', qr: 'url' } as const

export interface FieldsActions {
  pickAsset?: (slot: SlotDeclaration) => Promise<SlotValue | undefined>
  onSelectFill(id: string): void
  onAddFill(): void
  onRemoveFill(): void
  onRenameFill(label: string): void
  onChangeValue(key: string, value: SlotValue | undefined): void
  onOverride(key: string): void
  onUseSource(key: string): void
}

export function renderFields(container: HTMLElement, context: ItemSettingsSectionContext, actions: FieldsActions): void {
  const fill = selectedFill(context.fills, context.fill)
  const switcher = document.createElement('div')
  switcher.part.add('fills')
  switcher.append(fillSelect(context, actions), fillName(context, fill, actions), addButton(context.labels, actions), removeButton(context, actions))
  const slots = document.createElement('div')
  slots.part.add('slots')
  for (const slot of context.declarations) {
    slots.append(slotField(slot, slotFieldView(slot, fill, context.source, context.report), context, actions))
  }
  container.append(switcher, slots)
}

function fillSelect(context: ItemSettingsSectionContext, actions: FieldsActions): HTMLLabelElement {
  const label = document.createElement('label')
  const caption = document.createElement('span')
  caption.append(isolated(context.labels.fills))
  const select = document.createElement('select')
  select.part.add('fill-select')
  for (const fill of context.fills) {
    const option = document.createElement('option')
    option.value = fill.id
    option.textContent = fillLabel(fill)
    select.append(option)
  }
  select.value = context.fill ?? ''
  select.addEventListener('change', () => actions.onSelectFill(select.value))
  label.append(caption, select)
  return label
}

function fillName(context: ItemSettingsSectionContext, fill: Fill | undefined, actions: FieldsActions): HTMLLabelElement {
  const label = document.createElement('label')
  const caption = document.createElement('span')
  caption.append(isolated(context.labels.fillName))
  const input = document.createElement('input')
  input.part.add('fill-label')
  input.dir = 'auto'
  input.value = fill?.label ?? ''
  input.disabled = fill === undefined
  input.addEventListener('input', () => actions.onRenameFill(input.value))
  label.append(caption, input)
  return label
}

function addButton(labels: ItemSettingsLabels, actions: FieldsActions): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.dataset.action = 'add'
  button.textContent = labels.addFill
  button.dir = 'auto'
  button.addEventListener('click', () => actions.onAddFill())
  return button
}

function removeButton(context: ItemSettingsSectionContext, actions: FieldsActions): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.dataset.action = 'remove'
  button.textContent = context.labels.removeFill
  button.dir = 'auto'
  button.disabled = context.fill === null
  button.addEventListener('click', () => actions.onRemoveFill())
  return button
}

function slotField(slot: SlotDeclaration, view: SlotFieldView, context: ItemSettingsSectionContext, actions: FieldsActions): HTMLElement {
  const field = document.createElement('div')
  field.part.add('slot')
  field.dataset.key = slot.key
  field.append(
    slotCaption(view, context.labels),
    slotControl(slot, view, context, actions),
    slotActions(view, context.labels, actions),
    ...slotWarnings(view, context.labels),
  )
  return field
}

function slotCaption(view: SlotFieldView, labels: ItemSettingsLabels): HTMLSpanElement {
  const caption = document.createElement('span')
  caption.append(isolated(view.label))
  if (!view.required) return caption
  const marker = document.createElement('span')
  marker.part.add('required')
  marker.setAttribute('aria-hidden', 'true')
  marker.textContent = '*'
  caption.append(marker)
  caption.title = labels.required
  return caption
}

function slotControl(slot: SlotDeclaration, view: SlotFieldView, context: ItemSettingsSectionContext, actions: FieldsActions): HTMLElement {
  if (slot.type === 'image') return imageControl(slot, view, context.labels, actions)
  const input = document.createElement('input')
  input.type = INPUT_TYPE[slot.type]
  input.dir = 'auto'
  input.value = view.text
  input.readOnly = view.readOnly
  input.required = view.required
  input.setAttribute('aria-required', String(view.required))
  if (view.readOnly) input.setAttribute('aria-readonly', 'true')
  input.addEventListener('input', () => actions.onChangeValue(slot.key, input.value))
  return input
}

function imageControl(slot: SlotDeclaration, view: SlotFieldView, labels: ItemSettingsLabels, actions: FieldsActions): HTMLElement {
  const group = document.createElement('div')
  const file = document.createElement('input')
  file.type = 'file'
  file.accept = 'image/*'
  file.disabled = view.readOnly
  file.required = view.required
  file.setAttribute('aria-required', String(view.required))
  file.addEventListener('change', () => readImageFile(file, slot.key, actions))
  group.append(file)
  if (typeof view.value === 'object') {
    const chosen = document.createElement('span')
    chosen.dataset.asset = view.value.asset
    chosen.append(isolated(view.value.asset))
    group.append(chosen)
  }
  if (!actions.pickAsset || view.readOnly) return group
  const pick = document.createElement('button')
  pick.type = 'button'
  pick.dataset.action = 'pick-asset'
  pick.textContent = labels.chooseAsset
  pick.dir = 'auto'
  pick.addEventListener('click', () => void pickAsset(slot, actions))
  group.append(pick)
  return group
}

function slotActions(view: SlotFieldView, labels: ItemSettingsLabels, actions: FieldsActions): HTMLElement {
  const row = document.createElement('div')
  row.part.add('slot-actions')
  if (view.canOverride) {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.action = 'override'
    button.textContent = labels.override
    button.dir = 'auto'
    button.addEventListener('click', () => actions.onOverride(view.key))
    row.append(button)
  }
  if (view.canUseSource) {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.action = 'use-source'
    button.textContent = labels.useSource
    button.dir = 'auto'
    button.addEventListener('click', () => actions.onUseSource(view.key))
    row.append(button)
  }
  return row
}

function slotWarnings(view: SlotFieldView, labels: ItemSettingsLabels): HTMLParagraphElement[] {
  return view.warnings.map((warning) => {
    const note = document.createElement('p')
    note.part.add('warning')
    note.dataset.warning = warning
    note.append(isolated(labels[warning]))
    return note
  })
}

function readImageFile(input: HTMLInputElement, key: string, actions: FieldsActions) {
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.addEventListener('load', () => {
    if (typeof reader.result === 'string') actions.onChangeValue(key, reader.result)
  })
  reader.readAsDataURL(file)
}

async function pickAsset(slot: SlotDeclaration, actions: FieldsActions) {
  const value = await actions.pickAsset?.(slot)
  if (value !== undefined) actions.onChangeValue(slot.key, value)
}

// Library and label text sits in a <bdi>, so it takes its own direction while its block keeps the panel's alignment.
function isolated(text: string): HTMLElement {
  const bdi = document.createElement('bdi')
  bdi.textContent = text
  return bdi
}
