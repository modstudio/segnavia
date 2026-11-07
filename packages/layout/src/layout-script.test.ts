import { expect, test } from 'bun:test'
import { layoutScript } from './layout-script.ts'
import { input, settings } from './paginate-book.test-helper.ts'
import { planBook } from './plan-book.ts'

test('layoutScript evaluates in a bare scope and its planBook matches the module', () => {
  const embedded = new Function(`${layoutScript()};return {planBook,convergeLayout}`)() as {
    planBook: typeof planBook
    convergeLayout: unknown
  }
  const measurements = input({ flows: [], settings: { ...settings, direction: 'rtl' } })
  const numbering = { frontMatter: 'hebrew' as const, body: 'hebrew' as const }
  expect(embedded.planBook(measurements, numbering)).toEqual(planBook(measurements, numbering))
  expect(typeof embedded.convergeLayout).toBe('function')
})
