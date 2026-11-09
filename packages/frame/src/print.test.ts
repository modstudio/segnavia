import { expect, test } from 'bun:test'
import { limitRefusal } from '@segnavia/format'
import { pagesSheetsExceeded } from './print.ts'

test('a prepared print above the sheet limit carries the measured refusal', () => {
  expect(pagesSheetsExceeded(4, { sheets: 3 })).toEqual({
    measure: 'sheets',
    limit: 3,
    actual: 4,
    message: limitRefusal('sheets', 4, 3),
  })
  expect(pagesSheetsExceeded(3, { sheets: 3 })).toBeUndefined()
})
