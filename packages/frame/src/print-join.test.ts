import { expect, test } from 'bun:test'
import { joinPrintDocuments } from './print-join.ts'

test('joined print documents keep copy bodies in entry order', () => {
  const first = '<!doctype html><html><head></head><body><section class="sheet">Ada</section></body></html>'
  const second = '<!doctype html><html><head></head><body><section class="sheet">Bea</section></body></html>'
  expect(joinPrintDocuments([first, second])).toContain('<section class="sheet">Ada</section><section class="sheet">Bea</section>')
})
