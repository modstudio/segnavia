import { expect, test } from 'bun:test'
import { Deck, type PreflightReport } from '@segnavia/format'
import { PDFDocument } from 'pdf-lib'
import { renderDeckPdf } from './deck-pdf.ts'
import { resolveRenderPreflight } from './preflight.ts'

async function onePage(width: number, height: number): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.addPage([width, height]).drawRectangle({ x: 0, y: 0, width, height })
  return pdf.save()
}

const deck = Deck.parse({
  title: 'Deck',
  size: { width: 400, height: 200 },
  slides: [
    { id: 'one', content: { kind: 'html', html: '<p>One</p>' } },
    { id: 'two', content: { kind: 'html', html: '<p>Two</p>' } },
  ],
})

const imposition = {
  paper: { width: 120, height: 80, unit: 'mm' as const },
  orientation: 'landscape' as const,
  columns: 2,
  rows: 1,
  cell: { width: 40, height: 60 },
  margin: { top: 10, right: 15, bottom: 10, left: 15 },
  gap: { column: 10, row: 0 },
}

test.each([
  ['default', 'warnings', undefined],
  ['strict', 'refuses', undefined],
  ['strict', 'refuses', imposition],
] as const)('deck PDF %s preflight reports an overset slide and %s with imposition %p', async (profile, outcome, imposed) => {
  const reports: PreflightReport[] = []
  const rendering = renderDeckPdf(
    deck,
    { preflight: resolveRenderPreflight({ profile, report: (report) => reports.push(report) }), imposition: imposed },
    {
      renderPdf: async (setup) => {
        setup.preflightReport?.({ fontFailures: [], slotFits: setup.html.includes('<section class="sheet">') ? [] : [{ title: 'overflowed' }] })
        if (!setup.html.includes('<section class="sheet">')) return onePage(400, 200)
        const pdf = await PDFDocument.create()
        pdf.addPage([300, 150]).drawRectangle({ x: 0, y: 0, width: 300, height: 150 })
        pdf.addPage([300, 150]).drawRectangle({ x: 0, y: 0, width: 300, height: 150 })
        return pdf.save()
      },
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
  )
  if (outcome === 'refuses') await expect(rendering).rejects.toThrow('Slot title is overset')
  else await expect(rendering).resolves.toBeInstanceOf(Uint8Array)
  expect(reports).toHaveLength(1)
  expect(reports[0]?.issues[0]?.location).toEqual({ folio: '1' })
  expect(reports[0]?.coverage).toEqual({ measured: 2, total: 2 })
})

test('deck-wide font failures stay locationless when the same face also fails in a slide tab', async () => {
  const reports: PreflightReport[] = []
  const missing = { font: 'body', family: 'Body', reason: 'unsupplied' as const }
  const fontDeck = Deck.parse({
    ...deck,
    style: { fonts: { body: { faces: [{}] } } },
  })
  await renderDeckPdf(
    fontDeck,
    {
      fontSource: { font: async () => undefined },
      preflight: resolveRenderPreflight({ profile: 'default', report: (report) => reports.push(report) }),
    },
    {
      renderPdf: async (setup) => {
        setup.preflightReport?.({ fontFailures: setup.fontFailures?.slice(0, 1) ?? [missing], slotFits: [] })
        if (!setup.html.includes('<section class="sheet">')) return onePage(400, 200)
        const pdf = await PDFDocument.create()
        pdf.addPage([300, 150])
        pdf.addPage([300, 150])
        return pdf.save()
      },
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
  )
  expect(reports).toHaveLength(1)
  expect(reports[0]?.issues).toHaveLength(1)
  expect(reports[0]?.issues[0]).toMatchObject({ check: 'font-missing', subject: 'body' })
  expect(reports[0]?.issues[0]?.location).toBeUndefined()
})
