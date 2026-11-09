import { expect, test } from 'bun:test'
import { SLOT_STATES, type SlotDeclaration, type SlotState } from '@segnavia/format'
import { renderFields } from './item-settings-fields.ts'
import { ENGLISH_ITEM_SETTINGS_LABELS } from './item-settings-labels.ts'
import { ItemSettingsTestElement, installItemSettingsTestDocument } from './item-settings-test-document.test-helper.ts'

installItemSettingsTestDocument()

test('each reported slot renders its state part, value and readable label', () => {
  const declarations: SlotDeclaration[] = SLOT_STATES.map((state) => ({ key: state, label: state, type: 'text', required: false }))
  const container = new ItemSettingsTestElement()

  renderFields(
    container as unknown as HTMLElement,
    {
      declarations,
      fills: [],
      fill: null,
      source: undefined,
      report: { fill: null, slots: Object.fromEntries(SLOT_STATES.map((state) => [state, state])), origins: {} },
      labels: ENGLISH_ITEM_SETTINGS_LABELS,
      dir: 'ltr',
    },
    {
      onSelectFill() {},
      onAddFill() {},
      onRemoveFill() {},
      onRenameFill() {},
      onChangeValue() {},
      onOverride() {},
      onUseSource() {},
    },
  )

  const slots = container.children[1]
  expect(slots?.children).toHaveLength(SLOT_STATES.length)
  for (const [index, state] of SLOT_STATES.entries()) {
    const renderedState = slots?.children[index]?.children.find((child) => child.part.has('state'))
    expect(renderedState?.dataset.state).toBe(state)
    expect(renderedState?.children[0]?.textContent).toBe(slotLabel(state))
  }
})

test('an overflowed slot renders its state and warning parts together', () => {
  const container = new ItemSettingsTestElement()
  renderFields(
    container as unknown as HTMLElement,
    {
      declarations: [{ key: 'name', label: 'Name', type: 'text', required: false }],
      fills: [],
      fill: null,
      source: undefined,
      report: { fill: null, slots: { name: 'overflowed' }, origins: {} },
      labels: ENGLISH_ITEM_SETTINGS_LABELS,
      dir: 'ltr',
    },
    {
      onSelectFill() {},
      onAddFill() {},
      onRemoveFill() {},
      onRenameFill() {},
      onChangeValue() {},
      onOverride() {},
      onUseSource() {},
    },
  )

  const field = container.children[1]?.children[0]
  expect(field?.children.find((child) => child.part.has('state'))?.dataset.state).toBe('overflowed')
  expect(field?.children.find((child) => child.part.has('warning'))?.dataset.warning).toBe('overflowed')
})

function slotLabel(state: SlotState): string {
  return {
    filled: 'Filled',
    placeholder: 'Placeholder',
    unavailable: 'Unavailable',
    invalid: 'Invalid',
    fit: 'Fits',
    shrunk: 'Shrunk',
    overflowed: 'Overflowed',
  }[state]
}
