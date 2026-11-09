import { expect, test } from 'bun:test'
import { isLimitExceeded } from '@segnavia/format'
import { RenderLimitError, RenderRefusedError } from './errors.ts'

test('the universal limit guard recognizes a render refusal', () => {
  const error = new RenderLimitError('sheets', 2, 1)
  expect(error).toBeInstanceOf(RenderRefusedError)
  expect(isLimitExceeded(error)).toBe(true)
})
