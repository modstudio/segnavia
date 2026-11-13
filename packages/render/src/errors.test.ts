import { expect, test } from 'bun:test'
import { isLimitExceeded, Refusal } from '@segnavia/format'
import { RenderColorProfileError, RenderLimitError, RenderOversetError, RenderRefusedError } from './errors.ts'

test('the universal limit guard recognizes a render refusal', () => {
  const error = new RenderLimitError('sheets', 2, 1)
  expect(error).toBeInstanceOf(RenderRefusedError)
  expect(isLimitExceeded(error)).toBe(true)
})

test.each([
  [new RenderRefusedError('message'), 'render'],
  [new RenderLimitError('sheets', 2, 1), 'render-limit'],
  [new RenderOversetError(0, 2), 'render-overset'],
  [new RenderColorProfileError('proof', 'RGB', 'CMYK'), 'render-color-profile'],
] as const)('%s is a refusal with code %s', (error, code) => {
  expect(error).toBeInstanceOf(Refusal)
  expect(error.code).toBe(code)
})

test('render refusal accepts a specific code and color profile names its use', () => {
  expect(new RenderRefusedError('message', { code: 'asset' }).code).toBe('asset')
  expect(new RenderColorProfileError('proof', 'RGB', 'CMYK').subject).toBe('proof')
  expect(new RenderLimitError('sheets', 2, 1).refusals).toEqual([
    {
      code: 'limit',
      subject: 'sheets',
      message: "The PDF is 2 sheets, above the sheets limit of 1; raise the host's limits.sheets, or reduce the content to clear this refusal.",
    },
  ])
})
