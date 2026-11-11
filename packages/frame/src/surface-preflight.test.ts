import { expect, test } from 'bun:test'
import { boundPreflightReport, PREFLIGHT_PRESETS, type PreflightEntry } from '@segnavia/format'
import { mergeSurfacePreflightReports, SurfacePreflightCoordinator, type SurfacePreflightItem } from './surface-preflight.ts'

const facts = { pageCount: 1, pages: [], fits: [] }
const report = (entries: PreflightEntry[] = []) => boundPreflightReport({ entries, facts }, PREFLIGHT_PRESETS.default)
const overset = (subject: string): PreflightEntry => ({ check: 'slot-overset', subject, message: `${subject} is overset` })
const surface = (...keys: string[]): SurfacePreflightItem<string>[] => keys.map((key, index) => ({ key, folio: String(index + 1) }))

function coordinator() {
  const target = new EventTarget()
  const reports: import('@segnavia/format').PreflightReport[] = []
  target.addEventListener('preflight', (event) => reports.push((event as CustomEvent<import('@segnavia/format').PreflightReport>).detail))
  return { coordinator: new SurfacePreflightCoordinator<string>(target), reports }
}

test('receive dispatches a merged report with measured coverage', () => {
  const seen = coordinator()
  seen.coordinator.setSurface(surface('first', 'second'), true)
  seen.coordinator.receive('second', report())
  expect(seen.reports.at(-1)).toMatchObject({ status: 'incomplete', coverage: { measured: 1, total: 2 } })
})

test('a later report for the same key replaces the earlier report', () => {
  const seen = coordinator()
  seen.coordinator.setSurface(surface('slide'), true)
  seen.coordinator.receive('slide', report([overset('old')]))
  seen.coordinator.receive('slide', report([overset('new')]))
  expect(seen.reports.at(-1)?.issues.map(({ subject }) => subject)).toEqual(['new'])
  expect(seen.reports.at(-1)?.issues[0]?.location?.folio).toBe('1')
})

test('deck changes keep reports by slide id and drop ids that leave', () => {
  const seen = coordinator()
  seen.coordinator.setSurface(surface('kept', 'removed'), true)
  seen.coordinator.receive('kept', report([overset('kept')]))
  seen.coordinator.setSurface(surface('added', 'kept'), true)
  seen.coordinator.receive('added', report([overset('added')]))
  expect(seen.reports.at(-1)?.issues.map(({ subject, location }) => [subject, location?.folio])).toEqual([
    ['added', '1'],
    ['kept', '2'],
  ])
  seen.coordinator.setSurface(surface('added'), true)
  seen.coordinator.receive('added', report([overset('latest')]))
  expect(seen.reports.at(-1)?.issues.map(({ subject }) => subject)).toEqual(['latest'])
})

test('an invalid profile leaves the current profile and reports intact', () => {
  const seen = coordinator()
  seen.coordinator.setSurface(surface('first', 'second'), true)
  seen.coordinator.receive('first', report([overset('kept')]))
  expect(() => {
    seen.coordinator.profile = 'unknown' as never
  }).toThrow('unknown')
  seen.coordinator.receive('second', report())
  expect(seen.reports.at(-1)?.issues.map(({ subject }) => subject)).toEqual(['kept'])
  expect(seen.coordinator.profile).toBe('default')
})

test('an off profile ignores received reports', () => {
  const seen = coordinator()
  seen.coordinator.setSurface(surface('slide'), true)
  seen.coordinator.profile = 'off'
  seen.coordinator.receive('slide', report([overset('ignored')]))
  expect(seen.reports).toEqual([])
})

test('errors and warnings take precedence over incomplete coverage', () => {
  const warned = new Map([['slide', report([overset('warning')])]])
  const slides = surface('slide', 'unmeasured')
  expect(mergeSurfacePreflightReports(warned, slides, PREFLIGHT_PRESETS.default).status).toBe('warnings')
  expect(mergeSurfacePreflightReports(warned, slides, PREFLIGHT_PRESETS.strict).status).toBe('errors')
})
