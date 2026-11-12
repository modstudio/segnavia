import { expect, test } from 'bun:test'
import { appendSlotOversetEntries, boundPreflightReport, PREFLIGHT_PRESETS, type PreflightEntry, preflightRefusal } from '@segnavia/format'
import { composerScript } from './composer.ts'
import { mergeRegionFact } from './composer-fill-policy.ts'
import { embeddedPreflightFunctions, markFurnitureInvalidVariables } from './composer-preflight.ts'
import { slotPreflightFacts } from './embedded-preflight.ts'

test('waits for slot fit before publishing its one report', () => {
  const posted: unknown[] = []
  let fitted: ((slots: Record<string, string>) => void) | undefined
  const complete = new Function(
    'config',
    'planFolios',
    'preflightEntries',
    'preflightFits',
    'fail',
    'window',
    'document',
    'mergeRegionFact',
    'preflightRegions',
    `${embeddedPreflightFunctions()};return completePreflight`,
  )(
    { preflight: PREFLIGHT_PRESETS.default },
    { folios: [] },
    [],
    [],
    () => {},
    { parent: { postMessage: (message: unknown) => posted.push(message) }, segnaviaSlotFit: (done: typeof fitted) => (fitted = done) },
    {
      documentElement: { setAttribute: () => {} },
      querySelectorAll: () => [{ getAttribute: () => 'name:refuse' }],
    },
    mergeRegionFact,
    [],
  ) as (plan: unknown, flows: unknown[], done: () => void) => void
  let done = false
  complete({ pages: [] }, [], () => (done = true))
  expect(posted).toEqual([])
  expect(done).toBe(false)
  fitted?.({ name: 'overflowed' })
  expect((posted[0] as { report: { issues: Array<{ check: string; subject: string }> } }).report.issues).toContainEqual(
    expect.objectContaining({ check: 'slot-overset', subject: 'name' }),
  )
  expect(done).toBe(true)
})

test('strict preflight refuses an unmeasured refuse slot', () => {
  const posted: Array<{ report?: import('@segnavia/format').PreflightReport }> = []
  const failures: string[] = []
  const complete = new Function(
    'config',
    'planFolios',
    'preflightEntries',
    'preflightFits',
    'fail',
    'window',
    'document',
    'mergeRegionFact',
    'preflightRegions',
    `${embeddedPreflightFunctions()};return completePreflight`,
  )(
    { preflight: PREFLIGHT_PRESETS.strict },
    { folios: [] },
    [],
    [],
    (reason: string) => failures.push(reason),
    {
      parent: { postMessage: (message: { report?: import('@segnavia/format').PreflightReport }) => posted.push(message) },
      segnaviaSlotFit: (done: (slots: Record<string, string>) => void) => done({ name: 'unmeasured' }),
    },
    { documentElement: { setAttribute: () => {} }, querySelectorAll: () => [{ getAttribute: () => 'name:refuse' }] },
    mergeRegionFact,
    [],
  ) as (plan: { pages: unknown[] }, flows: unknown[], done: () => void) => void

  complete({ pages: [] }, [], () => {})
  expect(posted[0]?.report).toMatchObject({ status: 'errors', coverage: { slots: { measured: 0, total: 1 } } })
  expect(failures[0]).toContain('Overflow could not be measured for slot name')
})

test('slot preflight coverage counts distinct marked keys and only measured states', () => {
  const mark = (value: string) => ({ getAttribute: () => value })
  const facts = slotPreflightFacts({ name: 'fit', title: 'unmeasured' }, [mark('name:refuse'), mark('name:refuse'), mark('title:shrink:8')])
  expect(facts.coverage).toEqual({ measured: 1, total: 2 })
  expect(facts.refuse).toEqual(new Set(['name']))
})

test('slot overset names its subject and remedy under warning and strict profiles', () => {
  const entries: PreflightEntry[] = []
  appendSlotOversetEntries({ title: 'overflowed', body: 'fit' }, entries)
  const facts = { pageCount: 0, pages: [], fits: [] }
  expect(boundPreflightReport({ entries, facts }, PREFLIGHT_PRESETS.default).issues[0]).toMatchObject({
    check: 'slot-overset',
    subject: 'title',
    severity: 'warning',
  })
  expect(preflightRefusal(boundPreflightReport({ entries, facts }, PREFLIGHT_PRESETS.strict))).toBe(
    'Slot title is overset; shorten its value or enlarge the slot to clear it.',
  )
})

test('checks only no-fallback inline furniture variables and skips computed style when off', () => {
  const elements = [
    { getAttribute: () => 'color:var(--missing)', id: 'missing' },
    { getAttribute: () => 'color:var(--defined)', id: 'defined' },
    { getAttribute: () => 'color:var(--fallback, red)', id: 'fallback' },
  ]
  const entries: PreflightEntry[] = [{ check: 'css-var-invalid', subject: '--missing', message: 'Scanner already found --missing.' }]
  let calls = 0
  markFurnitureInvalidVariables({ querySelectorAll: () => elements } as unknown as Element, entries, ((element: { id: string }) => {
    calls++
    return { getPropertyValue: () => (element.id === 'defined' ? 'blue' : '') }
  }) as unknown as typeof getComputedStyle)
  expect(entries.filter((entry) => entry.subject === '--missing')).toHaveLength(1)
  expect(calls).toBe(2)
  expect(composerScript('{}')).toContain("if(config.preflight['css-var-invalid']!=='off')markFurnitureInvalidVariables")
})

test('seeds every compose from a fresh copy', () => {
  expect(composerScript('{}')).toContain('preflightEntries=(config.preflightSeed||[]).slice()')
})
