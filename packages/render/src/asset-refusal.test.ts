import { expect, test } from 'bun:test'
import type { LimitExceeded, RefusalCause } from '@segnavia/format'
import { collectedAssetRefusal } from './asset-refusal.ts'
import { RenderLimitError } from './errors.ts'

test('asset refusals and limits retain all causes and the existing message', () => {
  const first = { code: 'unapproved-origin', subject: 'https://one.example/a', message: 'first refusal' }
  const second = { code: 'host-rejected', subject: 'https://two.example/b', message: 'second refusal' }
  const limit = {
    code: 'asset-limit',
    subject: 'https://three.example/c',
    message: 'limit refusal',
  }
  const exceeded: LimitExceeded = { measure: 'assets.each', actual: 6, limit: 5, where: limit.subject, message: limit.message }
  const error = collectedAssetRefusal(
    new Map<string, RefusalCause>([
      [first.message, first],
      [second.message, second],
      [limit.message, limit],
    ]),
    new Map([[limit.subject, exceeded]]),
    [],
  )
  expect(error).toBeInstanceOf(RenderLimitError)
  expect(error).toMatchObject({
    message: 'first refusal; second refusal; limit refusal',
    refusals: [first, second, limit],
    exceeded: [exceeded],
  })
})

test('a URL named by several causes contributes its limit fact once', () => {
  const url = 'https://one.example/a'
  const rejected = { code: 'host-rejected', subject: url, message: 'rejected refusal' }
  const limit = { code: 'asset-limit', subject: url, message: 'limit refusal' }
  const exceeded: LimitExceeded = { measure: 'assets.each', actual: 6, limit: 5, where: url, message: limit.message }
  const error = collectedAssetRefusal(
    new Map<string, RefusalCause>([
      [rejected.message, rejected],
      [limit.message, limit],
    ]),
    new Map([[url, exceeded]]),
    [],
  )
  expect(error).toMatchObject({ exceeded: [exceeded] })
})

test('no collected asset problem returns no error', () => {
  expect(collectedAssetRefusal(new Map(), new Map(), [])).toBeUndefined()
})
