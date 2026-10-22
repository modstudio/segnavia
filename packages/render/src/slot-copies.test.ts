import { expect, test } from 'bun:test'
import { Deck, Page } from '@segnavia/format'
import { RequiredSlotsRefusedError, SlotFillsConflictError, SlotFillsRefusedError } from '@segnavia/html'
import { PDFDocument } from 'pdf-lib'
import { enforce } from './pdf-finish.ts'
import { renderSlotCopyPdfs } from './slot-copies.ts'
import { filledDeck, filledPages } from './slot-fill.ts'

async function pdfWithPages(count: number): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  for (let index = 0; index < count; index++) pdf.addPage([300, 150])
  return pdf.save()
}

const pages = [
  Page.parse({ html: '<p data-slot-value="name">Front</p>', slots: [{ key: 'name', label: 'Name', type: 'text', required: true }] }),
  Page.parse({ html: '<p data-slot-value="name">Back</p>', slots: [{ key: 'name', label: 'Name', type: 'text', required: true }] }),
]

const deck = Deck.parse({
  title: 'Cards',
  size: { width: 400, height: 200 },
  slots: [{ key: 'name', label: 'Name', type: 'text', required: true }],
  slides: [
    { id: 'front', content: { kind: 'html', html: '<p data-slot-value="name">Front</p>' } },
    { id: 'back', content: { kind: 'html', html: '<p data-slot-value="name">Back</p>' } },
  ],
})

const ada = { fill: { id: 'ada', values: { name: 'Ada' } } }
const bea = { fill: { id: 'bea', values: { name: 'Bea' } } }
const missing = { fill: { id: 'missing', values: {} } }

test('pages copies keep entry order and one collection per entry in the joined PDF', async () => {
  const order: string[] = []
  const pdf = await renderSlotCopyPdfs({ fills: [ada, bea] }, async (copy) => {
    const filled = await filledPages(pages, copy)
    order.push(`${copy.fill?.id}:${filled.map((page) => page.html).join('|')}`)
    return pdfWithPages(filled.length)
  })
  expect(order).toEqual(['ada:<p dir="auto">Ada</p>|<p dir="auto">Ada</p>', 'bea:<p dir="auto">Bea</p>|<p dir="auto">Bea</p>'])
  expect((await PDFDocument.load(pdf)).getPageCount()).toBe(4)
})

test('deck copies keep entry order and one slide set per entry in the joined PDF', async () => {
  const order: string[] = []
  const pdf = await renderSlotCopyPdfs({ fills: [ada, bea] }, async (copy) => {
    const filled = await filledDeck(deck, copy)
    const html = filled.slides.map((slide) => (slide.content.kind === 'html' ? slide.content.html : ''))
    order.push(`${copy.fill?.id}:${html.join('|')}`)
    return pdfWithPages(filled.slides.length)
  })
  expect(order).toEqual(['ada:<p dir="auto">Ada</p>|<p dir="auto">Ada</p>', 'bea:<p dir="auto">Bea</p>|<p dir="auto">Bea</p>'])
  expect((await PDFDocument.load(pdf)).getPageCount()).toBe(4)
})

test('default fills refusal lists every refused entry and produces no PDF', async () => {
  const rendered: string[] = []
  const job = renderSlotCopyPdfs({ fills: [missing, { fill: { id: 'also', values: {} } }] }, async (copy) => {
    rendered.push(copy.fill?.id ?? '')
    throw new RequiredSlotsRefusedError([{ key: 'name', state: 'placeholder' }])
  })
  await expect(job).rejects.toBeInstanceOf(SlotFillsRefusedError)
  await expect(job).rejects.toThrow('"missing" "name" (placeholder); "also" "name" (placeholder)')
  expect(rendered).toEqual(['missing', 'also'])
})

test('skipRefused joins the remaining copies and reports refused entries', async () => {
  const reports: string[] = []
  const pdf = await renderSlotCopyPdfs(
    {
      fills: [ada, missing, bea],
      skipRefused: true,
      report: (report) => reports.push(report.fill ?? ''),
    },
    async (copy) => {
      if (copy.fill?.id === 'missing') throw new RequiredSlotsRefusedError([{ key: 'name', state: 'placeholder' }])
      copy.report?.({ fill: copy.fill?.id ?? null, slots: { name: 'filled' }, origins: { name: 'hand' } })
      return pdfWithPages(1)
    },
  )
  expect((await PDFDocument.load(pdf)).getPageCount()).toBe(2)
  expect(reports).toEqual(['ada', 'missing', 'bea'])
})

test('skipRefused still refuses when every copy is refused', async () => {
  await expect(
    renderSlotCopyPdfs({ fills: [missing, { fill: { id: 'also', values: {} } }], skipRefused: true }, async () => {
      throw new RequiredSlotsRefusedError([{ key: 'name', state: 'placeholder' }])
    }),
  ).rejects.toBeInstanceOf(SlotFillsRefusedError)
})

test('fills together with fill is refused before any copy renders', async () => {
  let rendered = 0
  await expect(
    renderSlotCopyPdfs({ fills: [ada], fill: ada.fill }, async () => {
      rendered++
      return pdfWithPages(1)
    }),
  ).rejects.toBeInstanceOf(SlotFillsConflictError)
  expect(rendered).toBe(0)
})

test('a fills job counts every copy against maxSheets', async () => {
  const pdf = await renderSlotCopyPdfs({ fills: [ada, bea] }, async () => pdfWithPages(1))
  expect((await PDFDocument.load(pdf)).getPageCount()).toBe(2)
  await expect(enforce(pdf, { maxSheets: 1 })).rejects.toThrow('The PDF has 2 sheets; the limit is 1.')
})
