import { expect, test } from 'bun:test'
import { isLimitExceeded, LimitExceededError } from '@segnavia/format'
import { RenderInputsRefusedError } from './errors.ts'
import { settleRenderInputs } from './render-inputs.ts'

test('an input page limit remains limit-recognized among accepted inputs', async () => {
  const settled = await settleRenderInputs([{ id: 'good' }, { id: 'too-long' }], async (input) => {
    if (input.id === 'too-long') throw new LimitExceededError('pages', 3, 2)
    return input.id
  })
  const error = new RenderInputsRefusedError(settled.refused)
  expect(settled.accepted.map(({ value }) => value)).toEqual(['good'])
  expect(error.entries).toHaveLength(1)
  expect(isLimitExceeded(error.entries[0]?.error)).toBe(true)
  expect(error.exceeded).toMatchObject([{ measure: 'pages', actual: 3, limit: 2 }])
})

test('a non-refusal input failure propagates unchanged', async () => {
  const failure = new Error('programming error')
  await expect(settleRenderInputs([1], async () => Promise.reject(failure))).rejects.toBe(failure)
})
