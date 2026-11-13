import { describe, expect, test } from 'bun:test'
import { frameDocument } from './bridge.ts'
import { FIELD_BASE_CSS, fieldSizeCss } from './field-style.ts'
import { frameStyleSheets } from './frame-style-sheets.ts'

describe('form field base style', () => {
  test('uses zero-specificity logical geometry and plain appearance defaults', () => {
    const selectors = [...FIELD_BASE_CSS.matchAll(/(?:^|\n)([^{}]+)\{/g)].map((match) => match[1] ?? '')
    expect(selectors.length).toBeGreaterThan(5)
    expect(selectors.every((selector) => selector.startsWith(':where('))).toBe(true)
    expect(FIELD_BASE_CSS).not.toMatch(/:where\([^{]*::[^{]*\)\{/)
    expect(FIELD_BASE_CSS).not.toMatch(/(?:^|[;{])(left|right|top|bottom|width|height|margin-left|margin-right|padding-left|padding-right):/)
    for (const property of ['rule-color', 'rule-width', 'box-color', 'answer-color', 'answer-font', 'mark-color'])
      expect(FIELD_BASE_CSS).toContain(`var(--segnavia-field-${property},`)
  })

  test('emits one canonical rule per distinct validated size', () => {
    const css = fieldSizeCss(
      '<span data-segnavia-field="line" data-segnavia-field-length="01.50em"></span><span data-segnavia-field="line" data-segnavia-field-length="1.5em"></span><span data-segnavia-field="line" data-segnavia-field-length="12px"></span><div data-segnavia-field="box" data-segnavia-field-lines="3"></div><div data-segnavia-field="box" data-segnavia-field-lines="100"></div>',
    )
    expect(css.match(/inline-size:1\.5em/g)).toHaveLength(1)
    expect(css.match(/block-size:calc\(3 \* 1lh\)/g)).toHaveLength(1)
    expect(css).not.toContain('01.50em')
    expect(css).not.toContain('12px')
    expect(css).not.toContain('100')
  })

  test('the frame includes base and size styles', () => {
    expect(frameStyleSheets(undefined, undefined).join('')).toContain('data-segnavia-field="checkbox"')
    const html = frameDocument('<p><span data-segnavia-field="line" data-segnavia-field-length="8ch"></span></p>', { scripts: 'refuse', nonce: 'n' })
    expect(html).toContain('<style>@layer segnavia.base{:where([data-segnavia-field="line"][data-segnavia-field-length="8ch"]){inline-size:8ch}}</style>')
  })
})
