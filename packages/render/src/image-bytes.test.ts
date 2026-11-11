import { expect, test } from 'bun:test'
import { RenderLimitError } from './errors.ts'
import { enforceImageBytes } from './image-bytes.ts'

test('enforces the byte ceiling on the final stamped image', () => {
  const image = new Uint8Array(11)

  expect(enforceImageBytes(image, 11)).toBe(image)
  expect(() => enforceImageBytes(image, 10)).toThrow(RenderLimitError)
  try {
    enforceImageBytes(image, 10)
  } catch (error) {
    expect((error as RenderLimitError).exceeded).toMatchObject([{ measure: 'bytes', actual: 11, limit: 10 }])
  }
})
