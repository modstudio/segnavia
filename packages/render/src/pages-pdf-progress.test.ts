import { expect, test } from 'bun:test'
import { Page, PX_PER_MM } from '@segnavia/format'
import { prepareSlots, resolvePageHtml } from '@segnavia/html'
import { PDFDocument } from 'pdf-lib'
import { RenderRefusedError } from './errors.ts'
import { renderPagesPdf } from './pages-pdf.ts'
import { pagesPdfCopyProgress } from './pages-pdf-progress.ts'
import { pt } from './pdf-geometry.ts'
import { type RenderProgress, renderProgressReporter } from './progress.ts'

test('pagesPdf compose and set progress spans every slot-fill copy per original input', () => {
  const reports: RenderProgress[] = []
  const progress = renderProgressReporter({ report: (report) => reports.push(report) }, ['compose', 'set'])
  for (let copy = 0; copy < 2; copy += 1) {
    const copyProgress = pagesPdfCopyProgress(progress, copy, 2)
    copyProgress.report('compose', 1, 2, 3)
    copyProgress.report('compose', 2, 2, 3)
    copyProgress.report('set', 1, 1, 3)
  }
  expect(reports.map(({ stage, done, total, input }) => ({ stage, done, total, input }))).toEqual([
    { stage: 'compose', done: 1, total: 4, input: 3 },
    { stage: 'compose', done: 2, total: 4, input: 3 },
    { stage: 'set', done: 1, total: 2, input: 3 },
    { stage: 'compose', done: 3, total: 4, input: 3 },
    { stage: 'compose', done: 4, total: 4, input: 3 },
    { stage: 'set', done: 2, total: 2, input: 3 },
  ])
})

test('an imposed pagesPdf retry reports impose only for the pass that produces output', async () => {
  const page = (id: string) => resolvePageHtml(Page.parse({ id, html: `<p>${id}</p>`, size: { width: 100, height: 100 } }))
  const pdf = async () => {
    const document = await PDFDocument.create()
    document.addPage([pt(100 / PX_PER_MM), pt(100 / PX_PER_MM)])
    return document.save()
  }
  const reports: RenderProgress[] = []
  await renderPagesPdf(
    [page('good'), page('bad')],
    await prepareSlots(undefined),
    {
      imposition: {
        paper: { width: 30, height: 30, unit: 'mm' },
        columns: 1,
        rows: 1,
        cell: { width: 20, height: 20 },
        margin: { top: 5, right: 5, bottom: 5, left: 5 },
      },
      skipRefused: { report: () => {} },
    },
    {
      pagePdf: async () => ({ bytes: await pdf() }),
      piecePdf: async (input) => {
        if (input.id === 'bad') throw new RenderRefusedError('bad piece')
        return { bytes: await pdf() }
      },
      fontFaces: () => '',
      finish: async (bytes) => bytes,
      progress: renderProgressReporter({ report: (report) => reports.push(report) }, ['set', 'impose']),
    },
  )
  expect(reports.filter(({ stage }) => stage === 'impose').map(({ done, total }) => [done, total])).toEqual([[1, 1]])
})
