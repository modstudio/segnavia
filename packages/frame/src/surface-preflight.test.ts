import { expect, test } from 'bun:test'
import { boundPreflightReport, PREFLIGHT_PRESETS, type PreflightEntry } from '@segnavia/format'
import { mergeSurfacePreflightReports } from './surface-preflight.ts'

const facts = { pageCount: 1, pages: [], fits: [] }
const report = (entries: PreflightEntry[] = []) => boundPreflightReport({ entries, facts }, PREFLIGHT_PRESETS.default)
const overset = (subject: string): PreflightEntry => ({ check: 'slot-overset', subject, message: `${subject} is overset` })

test('counts measured frames and stays incomplete until every index has reported', () => {
  const reports = new Map([[1, report()]])
  expect(mergeSurfacePreflightReports(reports, 3, PREFLIGHT_PRESETS.default)).toMatchObject({
    status: 'incomplete',
    coverage: { measured: 1, total: 3 },
  })
  reports.set(0, report())
  reports.set(2, report())
  expect(mergeSurfacePreflightReports(reports, 3, PREFLIGHT_PRESETS.default)).toMatchObject({ status: 'clean', coverage: { measured: 3, total: 3 } })
})

test('a later report replaces the earlier report for its index', () => {
  const reports = new Map([[0, report([overset('old')])]])
  reports.set(0, report([overset('new')]))
  const merged = mergeSurfacePreflightReports(reports, 1, PREFLIGHT_PRESETS.default)
  expect(merged.issues.map(({ subject }) => subject)).toEqual(['new'])
  expect(merged.issues[0]?.location?.folio).toBe('1')
})

test('a report remains available after its frame is unmounted', () => {
  const kept = new Map([[0, report([overset('kept')])]])
  const mergedAfterUnmount = mergeSurfacePreflightReports(kept, 2, PREFLIGHT_PRESETS.default)
  expect(mergedAfterUnmount.issues[0]?.subject).toBe('kept')
  expect(mergedAfterUnmount.coverage).toEqual({ measured: 1, total: 2 })
})

test('errors and warnings take precedence over incomplete coverage', () => {
  const warned = new Map([[0, report([overset('warning')])]])
  expect(mergeSurfacePreflightReports(warned, 2, PREFLIGHT_PRESETS.default).status).toBe('warnings')
  expect(mergeSurfacePreflightReports(warned, 2, PREFLIGHT_PRESETS.strict).status).toBe('errors')
})
