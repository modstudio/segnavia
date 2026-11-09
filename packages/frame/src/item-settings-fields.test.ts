import { afterAll, expect, test } from 'bun:test'
import type { SlotDeclaration, SlotState } from '@segnavia/format'
import { renderFields } from './item-settings-fields.ts'
import { ENGLISH_ITEM_SETTINGS_LABELS } from './item-settings-labels.ts'

class TestElement extends EventTarget {
  children: TestElement[] = []
  dataset: Record<string, string> = {}
  part = new Set<string>()
  textContent = ''
  value = ''
  disabled = false
  readOnly = false
  required = false
  type = ''
  dir = ''

  append(...nodes: TestElement[]) {
    this.children.push(...nodes)
  }

  setAttribute() {}
}

const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
afterAll(() => {
  if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument)
  else Reflect.deleteProperty(globalThis, 'document')
})

Object.defineProperty(globalThis, 'document', {
  configurable: true,
  value: { createElement: () => new TestElement() },
})

test('each reported slot renders its state part, value and readable label', () => {
  const states: SlotState[] = ['filled', 'placeholder', 'unavailable', 'invalid', 'fit', 'shrunk', 'overflowed']
  const declarations: SlotDeclaration[] = states.map((state) => ({ key: state, label: state, type: 'text', required: false }))
  const container = new TestElement()

  renderFields(
    container as unknown as HTMLElement,
    {
      declarations,
      fills: [],
      fill: null,
      source: undefined,
      report: { fill: null, slots: Object.fromEntries(states.map((state) => [state, state])), origins: {} },
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
  expect(slots?.children).toHaveLength(states.length)
  for (const [index, state] of states.entries()) {
    const renderedState = slots?.children[index]?.children.find((child) => child.part.has('state'))
    expect(renderedState?.dataset.state).toBe(state)
    expect(renderedState?.children[0]?.textContent).toBe(slotLabel(state))
  }
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
