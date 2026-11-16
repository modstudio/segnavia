import { expect, test } from 'bun:test'
import { embeddedComposerHjViolationFunctions, hjViolationEntry, worstViolation } from './composer-hj-violations.ts'

const spacing = { minimum: 80, desired: 100, maximum: 133 }

test('finds the line furthest outside the author word-spacing limits', () => {
  expect(worstViolation([{ ratio: -1 }, { ratio: 0 }, { ratio: 1 }], spacing)).toBeUndefined()
  expect(worstViolation([{ ratio: 1.1 }], spacing)).toEqual({ line: 0, ratio: 1.1, wordSpacing: 136.3 })
  expect(worstViolation([{ ratio: -1.1 }], spacing)).toEqual({ line: 0, ratio: -1.1, wordSpacing: 78 })
  expect(worstViolation([{ ratio: 1.1 }, { ratio: -1.4 }, { ratio: 1.3 }], spacing)).toEqual({ line: 1, ratio: -1.4, wordSpacing: 72 })
})

test('treats both infinite ratios as worse than finite violations', () => {
  expect(worstViolation([{ ratio: 4 }, { ratio: Number.POSITIVE_INFINITY }], spacing)).toEqual({
    line: 1,
    ratio: Number.POSITIVE_INFINITY,
    wordSpacing: Number.POSITIVE_INFINITY,
  })
  expect(worstViolation([{ ratio: 4 }, { ratio: Number.NEGATIVE_INFINITY }], spacing)).toEqual({
    line: 1,
    ratio: Number.NEGATIVE_INFINITY,
    wordSpacing: Number.NEGATIVE_INFINITY,
  })
})

test('builds a bounded preflight entry with the paragraph subject and folio', () => {
  expect(hjViolationEntry('body-2', '12', { line: 1, ratio: 1.5, wordSpacing: 149.5 }, spacing)).toMatchObject({
    check: 'hj-violations',
    subject: 'body-2',
    location: { folio: '12' },
    message: expect.stringContaining('149.5% word spacing'),
  })
})

test('embeds a self-contained entry builder and message', () => {
  const embedded = new Function(`${embeddedComposerHjViolationFunctions()};return hjViolationEntry`)() as typeof hjViolationEntry
  expect(embedded('body', '4', { line: 0, ratio: 1.5, wordSpacing: 149.5 }, spacing).message).toContain('149.5% word spacing')
})
