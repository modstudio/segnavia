import { expect, test } from 'bun:test'
import { limitRefusal } from '@segnavia/format'
import { pagesSheetsRefusal } from './print-limits.ts'

test('browser pages printing refuses the imposed sheet count', () => {
  expect(pagesSheetsRefusal(4, { sheets: 3 })).toBe(limitRefusal('sheets', 4, 3))
  expect(pagesSheetsRefusal(3, { sheets: 3 })).toBeUndefined()
})
