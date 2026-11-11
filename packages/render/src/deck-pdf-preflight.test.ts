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

test.each([
  ['default', 'warnings'],
  ['strict', 'refuses'],
] as const)('deck PDF %s preflight reports an overset slide and %s', async (profile, outcome) => {
  const reports: PreflightReport[] = []
  const rendering = renderDeckPdf(
    deck,
    { preflight: resolveRenderPreflight({ profile, report: (report) => reports.push(report) }) },
    {
      renderPdf: async (setup) => {
        setup.preflightReport?.({ fontFailures: [], slotFits: [{ title: 'overflowed' }] })
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
