import { expect, test } from 'bun:test'
import { appendSlotOversetEntries, boundPreflightReport, PREFLIGHT_PRESETS, type PreflightEntry, preflightRefusal } from '@segnavia/format'
import { composerScript } from './composer.ts'
import { embeddedPreflightFunctions, markFurnitureInvalidVariables } from './composer-preflight.ts'

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
    `${embeddedPreflightFunctions()};return completePreflight`,
  )(
    { preflight: PREFLIGHT_PRESETS.default },
    { folios: [] },
    [],
    [],
    () => {},
    { parent: { postMessage: (message: unknown) => posted.push(message) }, segnaviaSlotFit: (done: typeof fitted) => (fitted = done) },
    { documentElement: { setAttribute: () => {} } },
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
