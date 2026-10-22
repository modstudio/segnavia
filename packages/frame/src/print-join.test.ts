import { expect, test } from 'bun:test'
import { joinPrintDocuments } from './print-join.ts'

test('joined print documents keep copy bodies in entry order', () => {
  const first = '<!doctype html><html><head></head><body><section class="sheet">Ada</section></body></html>'
  const second = '<!doctype html><html><head></head><body><section class="sheet">Bea</section></body></html>'
  expect(joinPrintDocuments([first, second])).toContain('<section class="sheet">Ada</section><section class="sheet">Bea</section>')
})

test('joined bodies stay literal when they contain replacement patterns', () => {
  const body = "<p>5$& $$ $` $' more</p>"
  const first = `<!doctype html><html><head></head><body>${body}</body></html>`
  const second = '<!doctype html><html><head></head><body><p>Second</p></body></html>'
  expect(joinPrintDocuments([first, second])).toContain(`<body>${body}<p>Second</p></body>`)
})
