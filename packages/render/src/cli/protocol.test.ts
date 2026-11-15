import { expect, test } from 'bun:test'
import { Refusal } from '@segnavia/format'
import { outcomeFromError, parseRenderRequest } from './protocol.ts'

const bytes = (value: string): Uint8Array => new TextEncoder().encode(value)

test('refuses invalid JSON and requests beyond an injected stdin bound', () => {
  expect(() => parseRenderRequest(bytes('{'))).toThrow('not valid JSON')
  try {
    parseRenderRequest(bytes('{}'), 1)
    throw new Error('expected refusal')
  } catch (error) {
    expect(error).toBeInstanceOf(Refusal)
    expect((error as Refusal).subject).toBe('stdin')
    expect((error as Error).message).toContain('1-byte bound')
  }
})

test('parses the strict request shape and requires an array for pages', () => {
  expect(parseRenderRequest(bytes('{"render":"page","document":{},"options":{}}'))).toEqual({ render: 'page', document: {}, options: {} })
  expect(() => parseRenderRequest(bytes('{"render":"unknown","document":{},"options":{}}'))).toThrow('unknown render value')
  expect(() => parseRenderRequest(bytes('{"render":"pages","document":{},"options":{}}'))).toThrow('must be an array')
})

test('maps refusals and failures to distinct one-line JSON outcomes', () => {
  const refused = outcomeFromError(
    new Refusal('outer', 'could not render', {
      subject: 'document',
      refusals: [{ code: 'inner', subject: 'page', message: 'bad page' }],
    }),
  )
  expect(refused.exitCode).toBe(2)
  expect(refused.stderr.endsWith('\n')).toBe(true)
  expect(refused.stderr.trim().split('\n')).toHaveLength(1)
  expect(JSON.parse(refused.stderr)).toEqual({
    refusal: {
      name: 'Refusal',
      code: 'outer',
      subject: 'document',
      message: 'could not render',
      refusals: [{ code: 'inner', subject: 'page', message: 'bad page' }],
    },
  })
  expect(JSON.parse(outcomeFromError(new Error('broken')).stderr)).toEqual({ failure: { name: 'Error', message: 'broken' } })
})
