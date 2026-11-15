import { expect, test } from 'bun:test'
import { Readable } from 'node:stream'
import { Refusal } from '@segnavia/format'
import { readRenderInput } from './input.ts'

const bytes = (value: string): Uint8Array => new TextEncoder().encode(value)

test('refuses past the bound without pulling another chunk', async () => {
  let pulledLaterChunk = false
  async function* chunks(): AsyncGenerator<Uint8Array> {
    yield bytes('ab')
    yield bytes('cd')
    pulledLaterChunk = true
    yield bytes('ef')
  }

  try {
    await readRenderInput(chunks(), 3)
    throw new Error('expected refusal')
  } catch (error) {
    expect(error).toBeInstanceOf(Refusal)
    expect((error as Refusal).subject).toBe('stdin')
    expect((error as Error).message).toContain('3-byte bound')
  }
  expect(pulledLaterChunk).toBe(false)
})

test('accepts input exactly at the bound', async () => {
  expect(await readRenderInput(Readable.from([bytes('ab'), bytes('cd')]), 4)).toEqual(bytes('abcd'))
})
