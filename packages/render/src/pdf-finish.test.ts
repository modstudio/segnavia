import { expect, test } from 'bun:test'
import { PDFDocument, rgb } from 'pdf-lib'
import { buildPressProfile } from './color/profile-fixture.test-helper.ts'
import { finishPdf } from './pdf-finish.ts'
import { type RenderProgress, renderProgressReporter } from './progress.ts'

async function rgbPdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  document.addPage([20, 20]).drawRectangle({ x: 1, y: 1, width: 10, height: 10, color: rgb(1, 0, 0) })
  return document.save()
}

test('finish progress completes effects and press passes in order', async () => {
  const effectsReports: RenderProgress[] = []
  await finishPdf(await rgbPdf(), {}, undefined, renderProgressReporter({ report: (report) => effectsReports.push(report) }, ['finish']))
  expect(effectsReports.map(({ done, total }) => [done, total])).toEqual([
    [1, 2],
    [2, 2],
  ])

  const pressReports: RenderProgress[] = []
  await finishPdf(
    await rgbPdf(),
    { press: { profile: buildPressProfile('mft1') } },
    undefined,
    renderProgressReporter({ report: (report) => pressReports.push(report) }, ['finish']),
  )
  expect(pressReports.map(({ done, total }) => [done, total])).toEqual([
    [1, 3],
    [2, 3],
    [3, 3],
  ])
})
