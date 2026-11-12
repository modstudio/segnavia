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

test('refuses unknown overflow modes', () => {
  expect(issues('<main data-region="body" data-overflow="clip"></main>')[0]).toContain('grow, truncate or refuse')
})
