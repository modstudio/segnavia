import { describe, expect, test } from 'bun:test'
import {
  boundPreflightReport,
  PREFLIGHT_CHECKS,
  PREFLIGHT_ISSUES_PER_CHECK,
  PREFLIGHT_PAGES_LIMIT,
  PREFLIGHT_PRESETS,
  preflightEnabled,
  preflightRefusal,
  resolvePreflightProfile,
} from './preflight.ts'

const facts = { pageCount: 1, pages: [{ folio: '1', first: 'a', last: 'z' }], fits: [{ group: 'sidebar', size: '9px' }] }
const entry = (check: 'region-overset' | 'furniture-overset', subject = 'body') => ({ check, subject, message: `Shorten ${subject} to clear it.` })

describe('preflight profiles', () => {
  test('resolves presets and fills a partial map with warnings', () => {
    expect(resolvePreflightProfile('strict')).toEqual(PREFLIGHT_PRESETS.strict)
    expect(resolvePreflightProfile({ 'region-overset': 'error' })['furniture-overset']).toBe('warning')
    expect(() => resolvePreflightProfile('other' as 'off')).toThrow('unknown')
    expect(() => resolvePreflightProfile({ 'region-overset': 'loud' as 'warning' })).toThrow('severity')
    expect(() => resolvePreflightProfile({ unknown: 'off' } as never)).toThrow('unknown')
    expect(() => resolvePreflightProfile(1 as never)).toThrow('profile is invalid')
    expect(preflightEnabled(PREFLIGHT_PRESETS.default)).toBe(true)
    expect(preflightEnabled(PREFLIGHT_PRESETS.off)).toBe(false)
  })
})

describe('boundPreflightReport', () => {
  test('applies severities, drops off checks, sorts errors first and derives status', () => {
    const profile = resolvePreflightProfile({ 'region-overset': 'warning', 'furniture-overset': 'error', 'slot-overset': 'off' })
    const report = boundPreflightReport(
      { entries: [entry('region-overset'), entry('furniture-overset', 'head'), { ...entry('region-overset'), check: 'slot-overset' }], facts },
      profile,
    )
    expect(report.status).toBe('errors')
    expect(report.issues.map(({ id, severity }) => ({ id, severity }))).toEqual([
      { id: 'furniture-overset:head', severity: 'error' },
      { id: 'region-overset:body', severity: 'warning' },
    ])
    expect(preflightRefusal(report)).toBe('Shorten head to clear it.')
  })

  test('caps each check, counts omissions, truncates text, and recomputes untrusted fields', () => {
    const entries = Array.from({ length: PREFLIGHT_ISSUES_PER_CHECK + 2 }, (_, index) => ({
      ...entry('region-overset', `${index}${'s'.repeat(300)}`),
      message: 'm'.repeat(1100),
      location: { folio: 'f'.repeat(40), block: 'b'.repeat(300) },
      id: 'forged',
      severity: 'error',
    }))
    const report = boundPreflightReport({ entries, facts }, PREFLIGHT_PRESETS.default)
    expect(report.issues).toHaveLength(PREFLIGHT_ISSUES_PER_CHECK)
    expect(report.omitted).toEqual({ 'region-overset': 2 })
    expect(report.issues[0]?.subject).toHaveLength(256)
    expect(report.issues[0]?.message).toHaveLength(1024)
    expect(report.issues[0]?.location).toEqual({ folio: 'f'.repeat(32), block: 'b'.repeat(256) })
    expect(report.issues[0]?.severity).toBe('warning')
    expect(report.issues[0]?.id).toBe(`region-overset:0${'s'.repeat(255)}`)
  })

  test('keeps one issue per id without counting duplicates as omitted', () => {
    const duplicate = entry('region-overset')
    const report = boundPreflightReport({ entries: [duplicate, duplicate], facts }, PREFLIGHT_PRESETS.default)
    expect(report.issues).toHaveLength(1)
    expect(report.omitted).toEqual({})
  })

  test('bounds scanning and carries only bounded known omission counts', () => {
    const scanLimit = PREFLIGHT_ISSUES_PER_CHECK * PREFLIGHT_CHECKS.length * 4
    let reads = 0
    const entries = new Proxy(
      Array.from({ length: scanLimit + 20 }, () => entry('region-overset')),
      {
        get(target, property, receiver) {
          if (typeof property === 'string' && /^\d+$/.test(property)) reads++
          return Reflect.get(target, property, receiver)
        },
      },
    )
    const report = boundPreflightReport(
      {
        entries,
        omitted: { 'region-overset': 9_999, 'furniture-overset': 3, 'slot-overset': -1, unknown: 99 },
        facts: { pageCount: PREFLIGHT_PAGES_LIMIT + 20, pages: [], fits: [] },
      },
      PREFLIGHT_PRESETS.default,
    )
    expect(reads).toBe(scanLimit)
    expect(report.omitted).toEqual({ 'region-overset': 9_999, 'furniture-overset': 3 })
    expect(report.facts.pageCount).toBe(PREFLIGHT_PAGES_LIMIT)
  })

  test('reports clean and warnings and bounds facts', () => {
    expect(boundPreflightReport({ entries: [], facts }, PREFLIGHT_PRESETS.default).status).toBe('clean')
    const report = boundPreflightReport({ entries: [entry('region-overset')], facts }, PREFLIGHT_PRESETS.default)
    expect(report.status).toBe('warnings')
    expect(report.facts).toEqual(facts)
    expect(preflightRefusal(report)).toBeUndefined()
    expect(boundPreflightReport({ entries: [], facts: { pageCount: -1 } }, PREFLIGHT_PRESETS.default).facts).toEqual({ pageCount: 0, pages: [], fits: [] })
  })
})
