import { expect, test } from 'bun:test'
import { fitPage, Imposition, impose, Page } from '@segnavia/format'
import { printablePageValues } from './print-document.ts'

test('printable pages carry a named width override into the print frame fit', () => {
  const imposition = Imposition.parse({
    paper: 'poster-12x18',
    orientation: 'landscape',
    columns: 1,
    rows: 1,
    cell: { width: 305, height: 200 },
  })
  const page = Page.parse({ html: '<p>Measured</p>', size: { width: 'standard', height: 'auto' } })
  const placement = impose(imposition, 1).placements[0]
  if (!placement) throw new Error('Expected one placement.')
  const fit = fitPage(page, placement, imposition.fit, { standard: 900 })
  const html = printablePageValues([page], imposition, { nonce: 'test', pageWidths: { standard: 900 } })
  expect(html).toContain('width:900px')
  expect(html).toContain(`left:${fit.x - placement.bleedBox.x}mm`)
})
