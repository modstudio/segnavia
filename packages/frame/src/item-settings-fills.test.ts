import { describe, expect, test } from 'bun:test'
import type { Fill } from '@segnavia/format'
import {
  addFill,
  fillLabel,
  isProvisionalFillId,
  nextSelectedFillId,
  provisionalFillId,
  removeFill,
  renameFill,
  replaceFill,
  sameFill,
  setFillValue,
} from './item-settings-fills.ts'

const mina: Fill = { id: 'mina', label: 'Mina', values: { name: 'Mina Patel' } }
const noah: Fill = { id: 'noah', values: { name: 'Noah Kim' } }

describe('fill switcher state', () => {
  test('lists a fill by its label and falls back to id', () => {
    expect(fillLabel(mina)).toBe('Mina')
    expect(fillLabel(noah)).toBe('noah')
  })

  test('adds, renames, replaces and removes fills without mutating the previous list', () => {
    const added = addFill([mina], noah)
    expect(added).toEqual([mina, noah])
    expect(added[0]).not.toBe(mina)
    expect(renameFill(added, 'noah', 'Noah Kim')).toEqual([mina, { id: 'noah', label: 'Noah Kim', values: { name: 'Noah Kim' } }])
    expect(replaceFill(added, 'mina', { ...mina, values: { name: 'Updated' } })[0]?.values.name).toBe('Updated')
    expect(removeFill(added, 'mina')).toEqual([noah])
    expect(added).toHaveLength(2)
  })

  test('selects the next remaining fill when the current one is removed', () => {
    expect(nextSelectedFillId([noah], 'mina', 'mina')).toBe('noah')
    expect(nextSelectedFillId([], 'mina', 'mina')).toBeNull()
    expect(nextSelectedFillId([mina, noah], 'mina', 'noah')).toBe('noah')
  })

  test('writes, clears and clones slot values including asset references', () => {
    const withLogo = setFillValue([mina], 'mina', 'logo', { asset: 'mark' })
    expect(withLogo[0]?.values.logo).toEqual({ asset: 'mark' })
    expect(withLogo[0]?.values.logo).not.toBe(mina.values.logo)
    expect(setFillValue(withLogo, 'mina', 'logo', undefined)[0]?.values.logo).toBeUndefined()
    expect(setFillValue(withLogo, 'mina', 'name', '')[0]?.values.name).toBeUndefined()
  })

  test('marks a provisional id so it is never treated as a host fill', () => {
    const id = provisionalFillId()
    expect(isProvisionalFillId(id)).toBe(true)
    expect(isProvisionalFillId('mina')).toBe(false)
    expect(sameFill(mina, { ...mina, values: { name: 'Mina Patel' } })).toBe(true)
    expect(sameFill(mina, { ...mina, values: { name: 'Other' } })).toBe(false)
  })
})
