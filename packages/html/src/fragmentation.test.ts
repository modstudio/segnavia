import { describe, expect, test } from 'bun:test'
import { fragmentationCss } from './fragmentation.ts'

const safeRules =
  ':where(tr,thead,tfoot,figure,img,svg){break-inside:avoid}:where(thead){display:table-header-group}:where(tfoot){display:table-footer-group}:where(h1,h2,h3,h4,h5,h6){break-after:avoid}'

describe('fragmentationCss', () => {
  test('returns zero-specificity safe rules or no rules', () => {
    expect(fragmentationCss('safe')).toBe(safeRules)
    expect(fragmentationCss('none')).toBe('')
  })
})
