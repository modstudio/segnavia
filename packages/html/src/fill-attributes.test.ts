import { expect, test } from 'bun:test'
import { fillAttributeIssues } from './fill-attributes.ts'
import { parse } from './sanitize.ts'

const issues = (html: string) => fillAttributeIssues(parse(html).children, 'fixture')

test('accepts bounded repeat fill and overflow in a named region', () => {
  expect(issues('<main data-region="practice" data-overflow="truncate"><p data-fill="repeat" data-fill-min="2" data-fill-max="8">שָׁלוֹם</p></main>')).toEqual([])
})

test('refuses fill outside a region and invalid bounds at the edge', () => {
  expect(issues('<p data-fill="repeat" data-fill-min="3" data-fill-max="2">row</p>').join(' ')).toContain('outside a named')
  expect(issues('<main data-region="body"><p data-fill="repeat" data-fill-min="many">row</p></main>').join(' ')).toContain('data-fill-min is invalid')
})

test('refuses zero repeat bounds by attribute name', () => {
  const minimum = issues('<main data-region="body"><p data-fill="repeat" data-fill-min="0">row</p></main>').join(' ')
  const maximum = issues('<main data-region="body"><p data-fill="repeat" data-fill-max="0">row</p></main>').join(' ')
  expect(minimum).toContain('data-fill-min is invalid')
  expect(maximum).toContain('data-fill-max is invalid')
})

test('refuses measured properties inside a repeated child by block and region', () => {
  const result = issues(
    '<main data-region="practice"><div data-fill="repeat"><p data-segnavia-id="measured-row" data-measure="block" data-measure-as="--row-height">row</p></div></main>',
  ).join(' ')
  expect(result).toContain('block "measured-row"')
  expect(result).toContain('repeated fill region "practice"')
  expect(result).toContain('move data-measure outside the repeated child')
})

test('refuses unknown overflow modes', () => {
  expect(issues('<main data-region="body" data-overflow="clip"></main>')[0]).toContain('grow, truncate or refuse')
})
