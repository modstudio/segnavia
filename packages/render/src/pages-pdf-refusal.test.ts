import { expect, test } from 'bun:test'
import { Page, PX_PER_MM } from '@segnavia/format'
import { prepareSlots, resolvePageHtml } from '@segnavia/html'
import { PDFDocument } from 'pdf-lib'
import { RenderInputsRefusedError, RenderRefusedError } from './errors.ts'
import { renderPagesPdf } from './pages-pdf.ts'
import { pt } from './pdf-geometry.ts'

const page = (input: Parameters<typeof Page.parse>[0]) => resolvePageHtml(Page.parse(input))
const slots = await prepareSlots(undefined)

async function pdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  document.addPage([pt(100 / PX_PER_MM), pt(100 / PX_PER_MM)])
  return document.save()
}

const services = (render: Parameters<typeof renderPagesPdf>[3]['pagePdf']): Parameters<typeof renderPagesPdf>[3] => ({
  pagePdf: render,
  piecePdf: async () => ({ bytes: new Uint8Array() }),
  fontFaces: () => '',
  finish: async (bytes) => bytes,
})

test('pagesPdf settles and names every refused input by its original position', async () => {
  const pages = [page({ id: 'good', html: '<p>Good</p>' }), page({ id: 'bad-a', html: '<p>A</p>' }), page({ id: 'bad-b', html: '<p>B</p>' })]
  const rendering = renderPagesPdf(
    pages,
    slots,
    {},
    services(async (input, _slots, _options, index) => {
      if (index > 0) throw new RenderRefusedError(`refused ${input.id}`)
      return { bytes: await pdf() }
    }),
  )
  try {
    await rendering
    throw new Error('expected input refusals')
  } catch (error) {
    expect(error).toBeInstanceOf(RenderInputsRefusedError)
    expect((error as RenderInputsRefusedError).entries.map(({ index, id }) => ({ index, id }))).toEqual([
      { index: 1, id: 'bad-a' },
      { index: 2, id: 'bad-b' },
    ])
  }
})

test('pagesPdf skips refused inputs only with a required report', async () => {
  const pages = [page({ id: 'one', html: '<p>One</p>' }), page({ id: 'bad', html: '<p>Bad</p>' }), page({ id: 'three', html: '<p>Three</p>' })]
  const reports: unknown[] = []
  const output = await renderPagesPdf(
    pages,
    slots,
    { skipRefused: { report: (refused) => reports.push(refused) } },
    services(async (input) => {
      if (input.id === 'bad') throw new RenderRefusedError('bad page')
      return { bytes: await pdf() }
    }),
  )
  expect((await PDFDocument.load(output)).getPageCount()).toBe(2)
  expect(reports).toHaveLength(1)
  expect(reports[0]).toMatchObject([{ index: 1, id: 'bad', error: { code: 'render' } }])
})

test('pagesPdf refuses when skipping would leave no output', async () => {
  const rendering = renderPagesPdf(
    [page({ id: 'bad', html: '<p>Bad</p>' })],
    slots,
    { skipRefused: { report: () => {} } },
    services(async () => {
      throw new RenderRefusedError('bad page')
    }),
  )
  await expect(rendering).rejects.toBeInstanceOf(RenderInputsRefusedError)
})
