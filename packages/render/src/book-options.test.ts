import { expect, test } from 'bun:test'
import { parseBookPdfOptions } from './book-options.ts'
import { RenderRefusedError } from './errors.ts'

test('turns an invalid saved plan field into a render refusal', () => {
  expect(() => parseBookPdfOptions({ plan: { version: 3 } } as never)).toThrow(RenderRefusedError)
  expect(() => parseBookPdfOptions({ plan: { version: 1 } } as never)).toThrow('version: version must be 6')
})
