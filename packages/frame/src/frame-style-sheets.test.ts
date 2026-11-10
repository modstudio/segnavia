import { expect, test } from 'bun:test'
import { boundPreflightReport, PREFLIGHT_PRESETS, type PreflightEntry, preflightRefusal, resolvePreflightProfile, StyleSheet } from '@segnavia/format'
import { frameStyleSheets } from './frame-style-sheets.ts'

test('carries enabled CSS findings into warnings and strict refusals', () => {
  const sheet = StyleSheet.parse({ css: 'p{color:var(--missing);background:url(https://example.test/a.png)}' })
  const facts = { pageCount: 0, pages: [], fits: [] }
  const entries: PreflightEntry[] = []
  frameStyleSheets(sheet, undefined, '', { profile: PREFLIGHT_PRESETS.default, entries })
  expect(entries.map(({ check, subject }) => ({ check, subject }))).toEqual([
    { check: 'css-var-invalid', subject: '--missing' },
    { check: 'css-url-network', subject: 'https://example.test/a.png' },
  ])
  expect(boundPreflightReport({ entries, facts }, PREFLIGHT_PRESETS.default).status).toBe('warnings')
  expect(preflightRefusal(boundPreflightReport({ entries, facts }, PREFLIGHT_PRESETS.strict))).toContain('--missing')

  const selective: PreflightEntry[] = []
  frameStyleSheets(sheet, undefined, '', { profile: resolvePreflightProfile({ 'css-var-invalid': 'off' }), entries: selective })
  expect(selective.map((entry) => entry.check)).toEqual(['css-url-network'])
})

test('resolves custom property definitions across every composed sheet', () => {
  const entries: PreflightEntry[] = []
  const document = StyleSheet.parse({ css: 'p{color:var(--segnavia-font-body);background:var(--brand);border-color:var(--missing)}' })
  const brand = StyleSheet.parse({ css: ':root{--brand:blue}' })
  frameStyleSheets(document, brand, ':root{--segnavia-font-body:Body}', { profile: PREFLIGHT_PRESETS.default, entries })
  expect(entries.filter((entry) => entry.check === 'css-var-invalid').map((entry) => entry.subject)).toEqual(['--missing'])
})

test('does not collect CSS findings without a preflight sink', () => {
  const sheet = StyleSheet.parse({ css: 'p{color:var(--missing)}' })
  expect(frameStyleSheets(sheet, undefined).join('')).toContain('p{color:var(--missing)}')
})
