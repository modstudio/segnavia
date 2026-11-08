import { expect, test } from 'bun:test'
import { layoutScript } from './layout-script.ts'
import { block, flow, input, settings } from './paginate-book.test-helper.ts'
import { planBook } from './plan-book.ts'
import { planPrintedPages } from './printed-pages.ts'

test('layoutScript evaluates in a bare scope and its planners match the module', () => {
  const embedded = new Function(`${layoutScript()};return {planBook,planPrintedPages,convergeLayout}`)() as {
    planBook: typeof planBook
    planPrintedPages: typeof planPrintedPages
    convergeLayout: unknown
  }
  const measurements = input({
    flows: [flow('front', 'front', [block('text', 'p', 0, 1, 1, 0)], 'Front'), flow('body', 'chapter', [block('text', 'p', 1, 1, 1, 0)], 'Body')],
    settings: { ...settings, direction: 'rtl' },
  })
  const numbering = { frontMatter: 'hebrew' as const, body: 'hebrew' as const }
  expect(embedded.planBook(measurements, numbering)).toEqual(planBook(measurements, numbering))
  const rules = { every: 'every', first: 'first', last: 'last', recto: 'recto', verso: 'verso' }
  expect(embedded.planPrintedPages(rules, 3, 'rtl', 'hebrew')).toEqual(planPrintedPages(rules, 3, 'rtl', 'hebrew'))
  expect(typeof embedded.convergeLayout).toBe('function')
})
