import { describe, expect, test } from 'bun:test'
import { fingerprintScript, fingerprintValue } from './document-fingerprint.ts'

describe('fingerprintValue', () => {
  test('is stable under object key order and changes with a line box', () => {
    expect(fingerprintValue({ settings: { direction: 'rtl' }, line: { top: 0, bottom: 12 } })).toBe(
      fingerprintValue({ line: { bottom: 12, top: 0 }, settings: { direction: 'rtl' } }),
    )
    expect(fingerprintValue({ line: { top: 0, bottom: 12 } })).not.toBe(fingerprintValue({ line: { top: 0, bottom: 13 } }))
  })

  test('embedded source matches the imported function in a fresh scope', () => {
    const embedded = new Function(`${fingerprintScript()}; return fingerprintValue;`)() as typeof fingerprintValue
    const values = [
      {
        settings: { direction: 'rtl' },
        lines: [
          { top: 0, bottom: 12 },
          { top: 12, bottom: 24 },
        ],
      },
      {
        lines: [
          { bottom: 12, top: 0 },
          { bottom: 24, top: 12 },
        ],
        settings: { direction: 'rtl' },
      },
      [1, { nested: ['a', null, { value: true }] }],
    ]
    expect(values.map(embedded)).toEqual(values.map(fingerprintValue))
    expect(embedded(values[0])).toBe(embedded(values[1]))
  })
})
