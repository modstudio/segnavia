import { expect, test } from 'bun:test'
import type { LimitExceeded, RefusalCause } from '@segnavia/format'
import { collectedAssetRefusal } from './asset-refusal.ts'
import { RenderLimitError, RenderRefusedError } from './errors.ts'

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
    new Map([[limit.message, exceeded]]),
    [],
  )
  expect(error).toBeInstanceOf(RenderLimitError)
  expect(error).toMatchObject({
    message: 'first refusal; second refusal; limit refusal',
    refusals: [first, second, limit],
    exceeded: [exceeded],
  })
})

test('unanswered assets become one structured cause per URL', () => {
  const urls = ['https://one.example/a', 'https://two.example/b']
  const error = collectedAssetRefusal(new Map(), new Map(), urls)
  expect(error).toBeInstanceOf(RenderRefusedError)
  expect(error).toMatchObject({
    code: 'asset',
    message: `The host assets option did not answer approved requests: ${urls.join(', ')}.`,
    refusals: urls.map((url) => ({ code: 'unanswered', subject: url, message: `${url} was not answered by the host assets option` })),
  })
})

test('no collected asset problem returns no error', () => {
  expect(collectedAssetRefusal(new Map(), new Map(), [])).toBeUndefined()
})
