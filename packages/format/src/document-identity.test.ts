import { expect, test } from 'bun:test'
import { withCrypto } from './crypto-test-helper.ts'
import { Document } from './document.ts'
import { defaultNewId } from './document-identity.ts'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

test('uses randomUUID when the secure-context source is present', async () => {
  let calls = 0
  const crypto = {
    randomUUID: () => {
      calls += 1
      return '00000000-0000-4000-8000-000000000001'
    },
  } as unknown as Crypto
  expect(await withCrypto(crypto, defaultNewId)).toBe('00000000-0000-4000-8000-000000000001')
  expect(calls).toBe(1)
})

test('builds distinct version 4 UUIDs with getRandomValues outside a secure context', async () => {
  let next = 0
  const crypto = {
    getRandomValues: <T extends ArrayBufferView | null>(array: T): T => {
      if (array instanceof Uint8Array) for (let index = 0; index < array.length; index += 1) array[index] = next++
      return array
    },
  } as unknown as Crypto
  const [first, second] = await withCrypto(crypto, () => [defaultNewId(), defaultNewId()])
  expect(first).toMatch(UUID_V4)
  expect(second).toMatch(UUID_V4)
  expect(second).not.toBe(first)
})

test('parses missing document ids without randomUUID', async () => {
  const original = globalThis.crypto
  const crypto = { getRandomValues: original.getRandomValues.bind(original) } as Crypto
  const parsed = await withCrypto(crypto, () => Document.parse({ type: 'document', kind: 'page', children: [{ type: 'page', body: { html: '<p>Body</p>' } }] }))
  expect(parsed.id).toMatch(UUID_V4)
  expect(parsed.children[0]?.id).toMatch(UUID_V4)
})

test('names the newId remedy when no cryptographic id source exists', async () => {
  await expect(withCrypto(undefined, defaultNewId)).rejects.toThrow(/crypto\.randomUUID.*crypto\.getRandomValues.*pass newId to clear this refusal/)
})
