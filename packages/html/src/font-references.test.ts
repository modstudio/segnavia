import { describe, expect, test } from 'bun:test'
import { fontReferenceRefusals } from './font-references.ts'

const known = new Set(['serif', 'heading'])

describe('fontReferenceRefusals', () => {
  test('unknown app name names the reference and what clears it', () => {
    expect(fontReferenceRefusals('<p></p>', [{ app: 'missing' }], known)).toEqual([
      'font reference {app:"missing"} could not establish app font "missing"; make that font available from the source to clear this refusal.',
    ])
  })

  test('name pattern names the reference and what clears it', () => {
    expect(fontReferenceRefusals('<p></p>', [{ app: 'Body' }], known)[0]).toBe(
      'font reference {app:"Body"} could not establish an app font name matching /^[a-z0-9-]+$/; use a lowercase name of letters, digits and hyphens to clear this refusal.',
    )
  })

  test('local family control characters name the reference and what clears it', () => {
    expect(fontReferenceRefusals('<p></p>', [{ local: 'Face\u0001', fallback: 'serif' }], known)).toEqual([
      `font reference {local:${JSON.stringify('Face\u0001')}, fallback:"serif"} could not establish a local family without control characters; remove control characters from the family name to clear this refusal.`,
    ])
  })

  test('local CSS without the declared fallback names the place and the required family list', () => {
    const html = '<p style="font-family: &quot;Some Local Face&quot;"></p>'
    expect(fontReferenceRefusals(html, [{ local: 'Some Local Face', fallback: 'serif' }], known)).toEqual([
      'page CSS font-family "Some Local Face" could not establish the declared fallback after "Some Local Face"; write font-family: "Some Local Face", var(--segnavia-font-serif) to clear this refusal.',
    ])
  })

  test('a different fallback names the place and the declared var', () => {
    const html = '<style>p{font-family:"Some Local Face", var(--segnavia-font-heading)}</style>'
    expect(fontReferenceRefusals(html, [{ local: 'Some Local Face', fallback: 'serif' }, { app: 'heading' }], known)).toEqual([
      'page CSS font-family "Some Local Face, var(--segnavia-font-heading)" could not establish fallback var(--segnavia-font-heading) matching declared var(--segnavia-font-serif); write font-family: "Some Local Face", var(--segnavia-font-serif) to clear this refusal.',
    ])
  })

  test('an undeclared var names the place and the missing app reference', () => {
    const html = '<p style="font-family: var(--segnavia-font-serif)"></p>'
    expect(fontReferenceRefusals(html, [], known)).toEqual([
      'page CSS var(--segnavia-font-serif) could not establish a fonts reference {app:"serif"}; add {app:"serif"} to the page or placed motif fonts to clear this refusal.',
    ])
  })

  test('agreeing local CSS and declared app vars are accepted', () => {
    const html = '<p style=\'font-family: "Some Local Face", var(--segnavia-font-serif)\'></p><style>h1{font-family:var(--segnavia-font-heading)}</style>'
    expect(fontReferenceRefusals(html, [{ local: 'Some Local Face', fallback: 'serif' }, { app: 'serif' }, { app: 'heading' }], known)).toEqual([])
  })

  test('font shorthand without a fallback is refused like font-family', () => {
    const html = '<p style="font:16px &quot;Some Local Face&quot;"></p>'
    expect(fontReferenceRefusals(html, [{ local: 'Some Local Face', fallback: 'serif' }], known)).toEqual([
      'page CSS font-family "Some Local Face" could not establish the declared fallback after "Some Local Face"; write font-family: "Some Local Face", var(--segnavia-font-serif) to clear this refusal.',
    ])
  })

  test('font shorthand with size, line-height and the declared fallback is accepted', () => {
    const html = '<p style=\'font:16px/1.4 "Some Local Face", var(--segnavia-font-serif)\'></p>'
    expect(fontReferenceRefusals(html, [{ local: 'Some Local Face', fallback: 'serif' }, { app: 'serif' }], known)).toEqual([])
  })
})
