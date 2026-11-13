import { expect, test } from 'bun:test'
import { Refusal } from '@segnavia/format'
import { LexiconRefusedError } from './lexicon-refusal.ts'

test('lexicon refusals share the refusal base', () => {
  const error = new LexiconRefusedError(400, 'bad request')
  expect(error).toBeInstanceOf(Refusal)
  expect(error.code).toBe('lexicon')
})
