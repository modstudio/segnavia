import { expect, test } from 'bun:test'
import { joinedDestinations } from './book-destinations.ts'

test('joins front and body destinations into output page numbers', () => {
  const frontDestination = { page: 2, x: 10, y: 20 }
  const bodyDestination = { page: 3, x: 30, y: 40 }
  const joined = joinedDestinations({ pages: 4, destinations: new Map([['front', frontDestination]]) }, { destinations: new Map([['body', bodyDestination]]) })

  expect(joined).toEqual(
    new Map([
      ['front', frontDestination],
      ['body', { ...bodyDestination, page: 7 }],
    ]),
  )
})
