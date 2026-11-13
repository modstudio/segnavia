import { expect, test } from 'bun:test'
import { AsOfRefusedError } from './as-of-policy.ts'
import { FontFaceRefusedError } from './font-refusal.ts'
import { PlacementRefusedError } from './placement-refusal.ts'
import { Refusal } from './refusal.ts'

test('a refusal exposes its stable structure and Error cause', () => {
  const cause = new Error('source')
  const error = new Refusal('example', 'message', { subject: 'item', cause })
  expect({ code: error.code, subject: error.subject, refusals: error.refusals, name: error.name, cause: error.cause }).toEqual({
    code: 'example',
    subject: 'item',
    refusals: [],
    name: 'Refusal',
    cause,
  })
})

test.each([
  [new AsOfRefusedError('message'), 'as-of'],
  [new FontFaceRefusedError('message'), 'font-face'],
  [new PlacementRefusedError('message'), 'placement'],
] as const)('%s is a refusal with code %s', (error, code) => {
  expect(error).toBeInstanceOf(Refusal)
  expect(error.code).toBe(code)
})
