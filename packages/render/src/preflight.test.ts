import { expect, test } from 'bun:test'
import { PREFLIGHT_PRESETS } from '@segnavia/format'
import { RenderRefusedError } from './errors.ts'
import { handlePreflightAttribute, resolveRenderPreflight, surfacePreflight } from './preflight.ts'

const facts = { pageCount: 1, pages: [{ folio: '1' }], fits: [] }

test('re-bounds the composed attribute and reports it once', () => {
  const reports: unknown[] = []
  const subject = 'x'.repeat(300)
  handlePreflightAttribute(
    JSON.stringify({
      issues: [{ check: 'region-overset', subject, message: 'Shorten it.' }],
      omitted: { 'region-overset': 2 },
      facts,
    }),
    PREFLIGHT_PRESETS.default,
    (report) => reports.push(report),
  )

  expect(reports).toHaveLength(1)
  expect(reports[0]).toMatchObject({ status: 'warnings', omitted: { 'region-overset': 2 } })
  expect((reports[0] as { issues: Array<{ subject: string }> }).issues[0]?.subject).toHaveLength(256)
})

test('reports before refusing an error with the preview message', () => {
  const calls: string[] = []
  const message = 'Shorten region body to clear it.'
  expect(() =>
    handlePreflightAttribute(JSON.stringify({ issues: [{ check: 'region-overset', subject: 'body', message }], facts }), PREFLIGHT_PRESETS.strict, () =>
      calls.push('report'),
    ),
  ).toThrow(new RenderRefusedError(message))
  expect(calls).toEqual(['report'])
})

test('malformed composed attributes refuse through the render channel', () => {
  expect(() => handlePreflightAttribute('{', PREFLIGHT_PRESETS.default)).toThrow(RenderRefusedError)
  expect(() => handlePreflightAttribute('{', PREFLIGHT_PRESETS.default)).toThrow(
    'The composed preflight report could not be read; compose the document again to clear this refusal.',
  )
})

test('surface preflight reports bounded slide issues with full coverage', () => {
  const reports: unknown[] = []
  const preflight = surfacePreflight(resolveRenderPreflight({ profile: 'default', report: (report) => reports.push(report) }), 3)
  preflight?.capture({ index: 1, folio: '2' })({
    slotFits: [{ title: 'overflowed' }],
    fontFailures: [{ font: 'body', family: 'Body', reason: 'unsupplied' }],
  })
  preflight?.complete()
  expect(reports).toEqual([
    {
      status: 'warnings',
      issues: [
        {
          check: 'slot-overset',
          subject: 'title',
          message: 'Slot title is overset; shorten its value or enlarge the slot to clear it.',
          id: 'slot-overset:title',
          severity: 'warning',
          location: { folio: '2' },
        },
        {
          check: 'font-missing',
          subject: 'Body',
          message: 'Font face Body is missing; supply and load that face to clear it.',
          id: 'font-missing:Body',
          severity: 'warning',
          location: { folio: '2' },
        },
      ],
      omitted: {},
      facts: { pageCount: 3, pages: [], fits: [], regions: [] },
      coverage: { measured: 3, total: 3, slots: { measured: 1, total: 1 } },
    },
  ])
})

test('surface preflight reports before refusing strict issues and stays silent when off', () => {
  const calls: string[] = []
  const strict = surfacePreflight(resolveRenderPreflight({ profile: 'strict', report: () => calls.push('report') }), 1)
  strict?.capture()({ slotFits: [{ title: 'overflowed' }], fontFailures: [] })
  expect(() => strict?.complete()).toThrow('Slot title is overset')
  expect(calls).toEqual(['report'])
  expect(surfacePreflight(resolveRenderPreflight({ profile: 'off', report: () => calls.push('off') }), 1)).toBeUndefined()
  expect(calls).toEqual(['report'])
})

test('surface preflight orders captures by slide index instead of display folio', () => {
  const reports: Array<{ issues: readonly { location?: { folio?: string } }[] }> = []
  const preflight = surfacePreflight(resolveRenderPreflight({ profile: 'default', report: (report) => reports.push(report) }), 2)
  preflight?.capture({ index: 1, folio: 'Slide two' })({ slotFits: [{ title: 'overflowed' }], fontFailures: [] })
  preflight?.capture({ index: 0, folio: 'Slide one' })({ slotFits: [{ title: 'overflowed' }], fontFailures: [] })
  preflight?.complete()
  expect(reports[0]?.issues[0]?.location).toEqual({ folio: 'Slide one' })
})

test('preflight rejects a non-function report at the option edge', () => {
  expect(() => resolveRenderPreflight({ profile: 'default', report: 'callback' } as never)).toThrow(
    'The preflight option needs a report function; pass preflight: { profile, report(report) {} }, or omit report to clear this refusal.',
  )
})
