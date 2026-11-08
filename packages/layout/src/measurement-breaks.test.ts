import { expect, test } from 'bun:test'
import { measurementsWithBreaks } from './measurement-breaks.ts'
import { block, flow, input } from './paginate-book.test-helper.ts'

test('sets breakBefore by measured block id without changing other blocks', () => {
  const measurements = input({
    flows: [flow('chapter', 'chapter', [block('text', 'p', 1, 1, 1, 0, { id: 'before' }), block('text', 'p', 1, 2, 1, 10, { id: 'forced' })])],
  })
  const changed = measurementsWithBreaks(measurements, ['forced'])
  const chapter = changed.flows[0]
  expect(chapter?.kind === 'fixed' ? [] : chapter?.blocks.map((held) => held.breakBefore)).toEqual([undefined, true])
  expect(measurements.flows[0]?.kind === 'fixed' ? undefined : measurements.flows[0]?.blocks[1]?.breakBefore).toBeUndefined()
})

test('refuses a break id that names no measured block', () => {
  expect(() => measurementsWithBreaks(input({ flows: [] }), ['missing'])).toThrow(
    'break missing names no block in this book; remove it from breaks to clear this refusal',
  )
})
