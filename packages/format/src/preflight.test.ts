import { describe, expect, test } from 'bun:test'
import {
  appendSlotOversetEntries,
  boundPreflightReport,
  fontMissingEntries,
  PREFLIGHT_CHECKS,
  PREFLIGHT_ISSUES_PER_CHECK,
  PREFLIGHT_PAGES_LIMIT,
  PREFLIGHT_PRESETS,
  PREFLIGHT_SLOTS_LIMIT,
  type PreflightEntry,
  preflightEnabled,
  preflightRefusal,
  resolvePreflightProfile,
} from './preflight.ts'

const facts = {
  pageCount: 1,
  pages: [{ folio: '1', first: 'a', last: 'z' }],
  fits: [{ subject: 'held', group: 'sidebar', values: { size: '9px' } }],
  regions: [],
}
const entry = (check: 'region-overset' | 'furniture-overset', subject = 'body') => ({ check, subject, message: `Shorten ${subject} to clear it.` })

describe('preflight profiles', () => {
  test('resolves inline overflow under every preset and in a profile map', () => {
    expect(PREFLIGHT_PRESETS.default['inline-overflow']).toBe('warning')
    expect(PREFLIGHT_PRESETS.strict['inline-overflow']).toBe('error')
    expect(PREFLIGHT_PRESETS.off['inline-overflow']).toBe('off')
    expect(resolvePreflightProfile({ 'inline-overflow': 'error' })['inline-overflow']).toBe('error')
  })

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
    expect(boundPreflightReport({ entries: [], facts: { pageCount: -1 } }, PREFLIGHT_PRESETS.default).facts).toEqual({
      pageCount: 0,
      pages: [],
      fits: [],
      regions: [],
    })
  })

  test('drops malformed fit facts and bounds their strategy count and text', () => {
    const fits = [
      { values: { size: '10px' } },
      { subject: 'card', group: 'g'.repeat(300), values: { size: '1'.repeat(300), leading: '1.2', tracking: '-.1px', extra: 'drop' } },
    ]
    const report = boundPreflightReport({ entries: [], facts: { pageCount: 0, pages: [], fits } as never }, PREFLIGHT_PRESETS.default)
    expect(report.facts.fits).toEqual([{ subject: 'card', group: 'g'.repeat(256), values: { size: '1'.repeat(64), leading: '1.2', tracking: '-.1px' } }])
  })

  test('bounds fill and truncation region facts at the host edge', () => {
    const regions = Array.from({ length: 260 }, (_, index) => ({
      subject: `${index}${'r'.repeat(300)}`,
      fillCount: 20_000,
      droppedPages: 2,
      droppedBlocks: 70,
      droppedIds: Array.from({ length: 60 }, (_, id) => `${id}${'x'.repeat(300)}`),
      droppedTotal: 70,
    }))
    const report = boundPreflightReport({ entries: [], facts: { pageCount: 0, pages: [], fits: [], regions } }, PREFLIGHT_PRESETS.default)
    expect(report.facts.regions).toHaveLength(256)
    expect(report.facts.regions[0]).toMatchObject({ fillCount: 10_000, droppedPages: 2, droppedBlocks: 70, droppedTotal: 70 })
    expect(report.facts.regions[0]?.subject).toHaveLength(256)
    expect(report.facts.regions[0]?.droppedIds).toHaveLength(50)
    expect(report.facts.regions[0]?.droppedIds?.[0]).toHaveLength(256)
  })

  test('reports short coverage as a profile check alongside other issues', () => {
    const pageMessage = 'Preflight measured 1 of 2 pages; a page that is never laid out cannot be checked. Lay out every page to clear this.'
    const slotMessage = 'Preflight measured 1 of 3 marked slots; a slot that is never laid out cannot be checked. Lay out every marked slot to clear this.'
    const warned = boundPreflightReport({ entries: [entry('region-overset')], facts, coverage: { measured: 1, total: 2 } }, PREFLIGHT_PRESETS.default)
    expect(warned).toMatchObject({ status: 'warnings', issues: [{ check: 'region-overset' }, { check: 'coverage-incomplete', subject: 'pages' }] })
    expect(warned.issues[1]?.message).toBe(pageMessage)

    const shortPages = boundPreflightReport({ entries: [], facts, coverage: { measured: 1, total: 2 } }, PREFLIGHT_PRESETS.strict)
    expect(shortPages.status).toBe('errors')
    expect(preflightRefusal(shortPages)).toBe(pageMessage)

    const shortSlots = boundPreflightReport(
      { entries: [], facts, coverage: { measured: 1, total: 1, slots: { measured: 1, total: 3 } } },
      PREFLIGHT_PRESETS.strict,
    )
    expect(shortSlots.status).toBe('errors')
    expect(preflightRefusal(shortSlots)).toBe(slotMessage)

    expect(boundPreflightReport({ entries: [], facts, coverage: { measured: 0, total: 1 } }, PREFLIGHT_PRESETS.default).issues[0]?.message).toBe(
      'Preflight measured 0 of 1 page; a page that is never laid out cannot be checked. Lay out every page to clear this.',
    )

    expect(boundPreflightReport({ entries: [entry('region-overset')], facts, coverage: { measured: 0, total: 1 } }, PREFLIGHT_PRESETS.off)).toMatchObject({
      status: 'clean',
      issues: [],
    })
    expect(boundPreflightReport({ entries: [], facts, coverage: { measured: 1, total: 1 } }, PREFLIGHT_PRESETS.default).issues).toEqual([])
  })

  test('sorts a coverage error before an earlier warning', () => {
    const report = boundPreflightReport(
      {
        entries: [{ check: 'slot-overset', subject: 'name', message: 'Name is overset.' }],
        facts,
        coverage: { measured: 1, total: 2 },
      },
      resolvePreflightProfile({ 'coverage-incomplete': 'error' }),
    )
    expect(report.issues.map(({ check, severity }) => [check, severity])).toEqual([
      ['coverage-incomplete', 'error'],
      ['slot-overset', 'warning'],
    ])
  })

  test('recomputes forged coverage issues from bounded coverage', () => {
    const report = boundPreflightReport(
      {
        entries: [{ check: 'coverage-incomplete', subject: 'forged', message: 'Forged.' }],
        facts,
        coverage: { measured: 1, total: 2 },
      },
      PREFLIGHT_PRESETS.default,
    )
    expect(report.issues).toEqual([
      {
        check: 'coverage-incomplete',
        subject: 'pages',
        message: 'Preflight measured 1 of 2 pages; a page that is never laid out cannot be checked. Lay out every page to clear this.',
        id: 'coverage-incomplete:pages',
        severity: 'warning',
      },
    ])
  })

  test('uses singular and plural slide wording when the counted unit is a slide', () => {
    const singular = boundPreflightReport({ entries: [], facts, coverage: { measured: 0, total: 1 } }, PREFLIGHT_PRESETS.default, { unit: 'slide' })
    const plural = boundPreflightReport({ entries: [], facts, coverage: { measured: 1, total: 2 } }, PREFLIGHT_PRESETS.default, { unit: 'slide' })
    expect(singular.issues[0]).toMatchObject({
      subject: 'slides',
      message: 'Preflight measured 0 of 1 slide; a slide that is never laid out cannot be checked. Lay out every slide to clear this.',
    })
    expect(plural.issues[0]).toMatchObject({
      subject: 'slides',
      message: 'Preflight measured 1 of 2 slides; a slide that is never laid out cannot be checked. Lay out every slide to clear this.',
    })
  })

  test('bounds page and slot coverage and defaults missing slot coverage to empty', () => {
    expect(
      boundPreflightReport(
        { entries: [], facts, coverage: { measured: PREFLIGHT_PAGES_LIMIT + 2, total: PREFLIGHT_PAGES_LIMIT + 1 } },
        PREFLIGHT_PRESETS.default,
      ).coverage,
    ).toEqual({
      measured: PREFLIGHT_PAGES_LIMIT,
      total: PREFLIGHT_PAGES_LIMIT,
      slots: { measured: 0, total: 0 },
    })
    expect(boundPreflightReport({ entries: [], facts, coverage: { measured: 2, total: 1 } }, PREFLIGHT_PRESETS.default).coverage).toEqual({
      measured: 1,
      total: 1,
      slots: { measured: 0, total: 0 },
    })
    expect(boundPreflightReport({ entries: [], facts }, PREFLIGHT_PRESETS.default).coverage).toEqual({
      measured: 1,
      total: 1,
      slots: { measured: 0, total: 0 },
    })
    expect(boundPreflightReport({ entries: [], facts, coverage: { measured: -1, total: 2 } }, PREFLIGHT_PRESETS.default).coverage).toEqual({
      measured: 1,
      total: 1,
      slots: { measured: 0, total: 0 },
    })
    expect(
      boundPreflightReport(
        { entries: [], facts, coverage: { measured: 1, total: 1, slots: { measured: PREFLIGHT_SLOTS_LIMIT + 2, total: PREFLIGHT_SLOTS_LIMIT + 1 } } },
        PREFLIGHT_PRESETS.default,
      ).coverage.slots,
    ).toEqual({ measured: PREFLIGHT_SLOTS_LIMIT, total: PREFLIGHT_SLOTS_LIMIT })
    expect(
      boundPreflightReport({ entries: [], facts, coverage: { measured: 1, total: 1, slots: { measured: -1, total: 2 } } }, PREFLIGHT_PRESETS.default).coverage
        .slots,
    ).toEqual({ measured: 0, total: 0 })
  })

  test('reports coverage issues when slot or page coverage falls short', () => {
    expect(
      boundPreflightReport({ entries: [], facts, coverage: { measured: 1, total: 1, slots: { measured: 1, total: 2 } } }, PREFLIGHT_PRESETS.default).issues[0],
    ).toMatchObject({ check: 'coverage-incomplete', subject: 'slots', severity: 'warning' })
    expect(boundPreflightReport({ entries: [], facts, coverage: { measured: 1, total: 1 } }, PREFLIGHT_PRESETS.default).status).toBe('clean')
    expect(boundPreflightReport({ entries: [], facts, coverage: { measured: 0, total: 1 } }, PREFLIGHT_PRESETS.default).issues[0]).toMatchObject({
      check: 'coverage-incomplete',
      subject: 'pages',
    })
  })

  test('strict preflight turns an unmeasured refuse slot into a slot overset error', () => {
    const entries: PreflightEntry[] = []
    appendSlotOversetEntries({ name: 'unmeasured' }, entries, { refuseKeys: new Set(['name']) })
    const report = boundPreflightReport({ entries, facts, coverage: { measured: 1, total: 1, slots: { measured: 0, total: 1 } } }, PREFLIGHT_PRESETS.strict)
    expect(report).toMatchObject({
      status: 'errors',
      issues: [
        { check: 'slot-overset', subject: 'name', severity: 'error' },
        { check: 'coverage-incomplete', subject: 'slots', severity: 'error' },
      ],
    })
    expect(report.issues[0]?.message).toContain('overflow could not be measured for slots: "name"')
    expect(report.issues[1]).toMatchObject({ check: 'coverage-incomplete', subject: 'slots', severity: 'error' })
    expect(preflightRefusal(report)).toBe(report.issues[0]?.message)
  })

  test('keeps a bounded slot coverage shortfall as an issue', () => {
    expect(
      boundPreflightReport({ entries: [], facts, coverage: { measured: 1, total: 1, slots: { measured: 200, total: 240 } } }, PREFLIGHT_PRESETS.default),
    ).toMatchObject({
      status: 'warnings',
      coverage: { slots: { measured: 200, total: 240 } },
      issues: [{ check: 'coverage-incomplete', subject: 'slots' }],
    })
  })

  test('an unmeasured state without a refuse mark reports only incomplete coverage', () => {
    const entries: PreflightEntry[] = []
    appendSlotOversetEntries({ name: 'unmeasured' }, entries)
    expect(
      boundPreflightReport({ entries, facts, coverage: { measured: 1, total: 1, slots: { measured: 0, total: 1 } } }, PREFLIGHT_PRESETS.default),
    ).toMatchObject({
      status: 'warnings',
      issues: [{ check: 'coverage-incomplete', subject: 'slots' }],
    })
  })
})

test('slot overset entries keep one subject and may carry a surface location', () => {
  const entries: PreflightEntry[] = [entry('region-overset')]
  appendSlotOversetEntries({ title: 'overflowed', body: 'fit' }, entries, { location: { folio: '2' } })
  appendSlotOversetEntries({ title: 'overflowed' }, entries, { location: { folio: '3' } })
  expect(entries.at(-1)).toEqual({
    check: 'slot-overset',
    subject: 'title',
    message: 'Slot title is overset; shorten its value or enlarge the slot to clear it.',
    location: { folio: '2' },
  })
  expect(entries).toHaveLength(2)
})

test('font missing entries distinguish failure remedies and collapse repeated faces', () => {
  const unsupplied = { font: 'body', family: 'Body', weight: 700 as const, style: 'italic', reason: 'unsupplied' as const }
  expect(fontMissingEntries([unsupplied, unsupplied, { ...unsupplied, reason: 'unloaded' }], { folio: '2' })).toEqual([
    {
      check: 'font-missing',
      subject: 'Body (weight 700, italic)',
      message: 'Font face Body (weight 700, italic) was not supplied; supply that face to clear it.',
      location: { folio: '2' },
    },
  ])
  expect(fontMissingEntries([{ ...unsupplied, reason: 'unloaded' }])).toEqual([
    {
      check: 'font-missing',
      subject: 'Body (weight 700, italic)',
      message: 'Font face Body (weight 700, italic) did not load in the frame; supply a face file the browser can load to clear it.',
    },
  ])
  expect(fontMissingEntries([{ font: 'body', family: 'Body', weight: [100, 900], reason: 'unsupplied' }])[0]?.subject).toBe('Body (weight 100–900)')
})
