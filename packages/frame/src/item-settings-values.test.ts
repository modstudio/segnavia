import { describe, expect, test } from 'bun:test'
import { type Fill, SLOT_STATES, type SlotDeclaration, type SlotReport } from '@segnavia/format'
import { overrideValue, slotFieldView, slotWarnings } from './item-settings-values.ts'

const name: SlotDeclaration = { key: 'name', label: 'Name', type: 'text', required: true }
const email: SlotDeclaration = { key: 'email', label: 'Email', type: 'email', required: false }
const fill: Fill = { id: 'mina', values: { email: 'mina@example.com' } }
const source: Fill = { id: 'crm', label: 'Directory', values: { name: 'Mina Patel', email: 'directory@example.com' } }

describe('slot field view', () => {
  test('a source origin is read-only with override, and a hand origin can return to source', () => {
    const fromSource = slotFieldView(name, {}, fill, source, { fill: 'mina', slots: { name: 'filled' }, origins: { name: 'source' } })
    expect(fromSource).toMatchObject({ text: 'Mina Patel', readOnly: true, canOverride: true, canUseSource: false })
    const overridden = slotFieldView(name, {}, { ...fill, values: { ...fill.values, name: 'Hand Name' } }, source, {
      fill: 'mina',
      slots: { name: 'filled' },
      origins: { name: 'hand' },
    })
    expect(overridden).toMatchObject({ text: 'Hand Name', readOnly: false, canOverride: false, canUseSource: true })
  })

  test('without a report, origin follows the same hand-over-source layering as filling', () => {
    expect(slotFieldView(name, {}, fill, source, undefined)).toMatchObject({ text: 'Mina Patel', readOnly: true })
    expect(slotFieldView(email, {}, fill, source, undefined)).toMatchObject({ text: 'mina@example.com', readOnly: false, canUseSource: true })
  })

  test('a design value takes precedence and clearing it falls back to the fill', () => {
    const filled = { ...fill, values: { ...fill.values, name: 'Fill Name' } }
    expect(slotFieldView(name, { name: 'Design Name' }, filled, source, undefined, true)).toMatchObject({
      text: 'Design Name',
      designOnly: true,
      canDesignOnly: true,
      readOnly: false,
    })
    expect(slotFieldView(name, {}, filled, source, undefined, true)).toMatchObject({ text: 'Fill Name', designOnly: false })
  })

  test('override copies the source value so the hand fill can edit it', () => {
    expect(overrideValue(source, 'name')).toBe('Mina Patel')
    expect(overrideValue(source, 'missing')).toBeUndefined()
  })

  test('a required slot that is not filled warns missing; overflowed and shrunk warn from the report', () => {
    const missingReport: SlotReport = { fill: 'mina', slots: { name: 'unavailable' }, origins: {} }
    expect(slotFieldView(name, {}, fill, undefined, missingReport).warnings).toEqual(['missing'])
    expect(slotWarnings(name, 'overflowed')).toEqual(['missing', 'overflowed'])
    expect(slotWarnings({ ...name, required: false }, 'shrunk')).toEqual(['shrunk'])
    expect(slotWarnings(name, 'filled')).toEqual([])
    expect(slotWarnings(name, 'fit')).toEqual([])
  })

  test('before any report, a required slot a layer supplies is not reported missing', () => {
    expect(slotFieldView(name, {}, fill, source, undefined).warnings).toEqual([])
    expect(slotFieldView(name, {}, fill, undefined, undefined).warnings).toEqual(['missing'])
  })

  test('a placeholder is display fallback rather than a supplied panel value', () => {
    const placeholder = { ...name, placeholder: 'Your name' }
    expect(slotFieldView(placeholder, {}, fill, undefined, undefined)).toMatchObject({ value: undefined, text: '', warnings: ['missing'] })
  })

  test('maps every reported slot state when the report names the displayed fill', () => {
    for (const state of SLOT_STATES) {
      expect(slotFieldView(name, {}, fill, source, { fill: 'mina', slots: { name: state }, origins: {} }).state).toBe(state)
    }
  })

  test('ignores report state and warnings when the report names another fill', () => {
    expect(slotFieldView(name, {}, fill, undefined, { fill: 'noah', slots: { name: 'overflowed' }, origins: {} })).toMatchObject({
      state: undefined,
      warnings: ['missing'],
    })
  })

  test('does not read a state through the report slots prototype', () => {
    expect(slotFieldView({ ...name, key: '__proto__' }, {}, fill, undefined, { fill: 'mina', slots: {}, origins: {} }).state).toBeUndefined()
  })
})
