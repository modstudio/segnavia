import { expect, test } from 'bun:test'
import { PREFLIGHT_PRESETS } from '@segnavia/format'
import { RenderRefusedError } from './errors.ts'
import { handlePreflightAttribute } from './preflight.ts'

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
