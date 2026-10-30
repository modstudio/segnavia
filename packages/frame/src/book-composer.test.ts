import { describe, expect, test } from 'bun:test'
import { bookNeedsMeasurementRetry } from './book-composer.ts'

describe('bookNeedsMeasurementRetry', () => {
  test('waits only when non-empty source content has no measured lines', () => {
    expect(bookNeedsMeasurementRetry({ sourceBlocks: 1, measuredLines: 0 })).toBe(true)
    expect(bookNeedsMeasurementRetry({ sourceBlocks: 1, measuredLines: 1 })).toBe(false)
    expect(bookNeedsMeasurementRetry({ sourceBlocks: 0, measuredLines: 0 })).toBe(false)
  })
})
