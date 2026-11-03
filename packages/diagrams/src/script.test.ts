import { describe, expect, test } from 'bun:test'
import { diagramErrorFirstLine, diagramLabelDirection, diagramScript } from './script.ts'

describe('diagram drawing runtime', () => {
  test('is valid JavaScript after the bundle and adapter are assembled', () => {
    expect(() => new Function(diagramScript)).not.toThrow()
  })

  test('keeps only the parser error first line', () => {
    expect(diagramErrorFirstLine(new Error('First\nSecond'))).toBe('First')
    expect(diagramErrorFirstLine('Plain\r\nMore')).toBe('Plain')
    expect(diagramErrorFirstLine('')).toBe('Diagram could not be drawn.')
  })

  test('uses the first strong letter direction rule', () => {
    expect(diagramLabelDirection('42 שלום')).toBe('rtl')
    expect(diagramLabelDirection('42 English שלום')).toBe('ltr')
    expect(diagramLabelDirection('42 العربية')).toBe('rtl')
    expect(diagramLabelDirection('42')).toBe('ltr')
  })
})
