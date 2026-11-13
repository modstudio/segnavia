import { describe, expect, test } from 'bun:test'
import { diagramErrorFirstLine, diagramFailureIssue, diagramLabelDirection } from './runtime.ts'

describe('diagram drawing runtime', () => {
  test('keeps only the parser error first line', () => {
    expect(diagramErrorFirstLine(new Error('First\nSecond'))).toBe('First')
    expect(diagramErrorFirstLine('Plain\r\nMore')).toBe('Plain')
    expect(diagramErrorFirstLine('')).toBe('Diagram could not be drawn.')
  })

  test('uses the shared first-strong-letter direction rule', () => {
    expect(diagramLabelDirection('42 שלום')).toBe('rtl')
    expect(diagramLabelDirection('42 English שלום')).toBe('ltr')
    expect(diagramLabelDirection('42 العربية')).toBe('rtl')
    expect(diagramLabelDirection('42')).toBe('ltr')
  })

  test('turns a parse failure into one layout report issue', () => {
    expect(diagramFailureIssue('chart', new Error('Parse error\nDetails'))).toEqual({ subject: 'chart', message: 'Parse error' })
  })
})
