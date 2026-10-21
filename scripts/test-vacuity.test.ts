import { describe, expect, test } from 'bun:test'
import { testVacuityFindings } from './checks/test-vacuity.ts'

describe('test vacuity guard', () => {
  describe('rejects each forbidden shape', () => {
    test('a test with no assertion', () => {
      expect(testVacuityFindings('x.test.ts', `test('empty', () => doThing())`)).toEqual([
        expect.objectContaining({ message: expect.stringContaining('no assertion') }),
      ])
    })

    test('a focused test', () => {
      expect(testVacuityFindings('x.test.ts', `test.only('focus', () => expect(true).toBe(true))`)).toEqual([
        expect.objectContaining({ message: expect.stringContaining('`.only`') }),
      ])
    })

    test('a bare expect call', () => {
      expect(testVacuityFindings('x.test.ts', `test('bare', () => expect(true))`)).toEqual([
        expect.objectContaining({ message: expect.stringContaining('no assertion') }),
      ])
    })

    test('an assert call without an argument', () => {
      expect(testVacuityFindings('x.test.ts', `test('bare', () => assert())`)).toEqual([
        expect.objectContaining({ message: expect.stringContaining('no assertion') }),
      ])
    })

    test('two tests with one literal title', () => {
      const source = `test('same', () => expect(true).toBe(true)); test('same', () => assert(true))`
      expect(testVacuityFindings('x.test.ts', source)).toEqual([expect.objectContaining({ message: expect.stringContaining('duplicate test title') })])
    })
  })

  test('a reasoned waiver permits an assertion hidden in a helper', () => {
    const source = `// vacuity-allow: the helper throws unless the round trip differs\ntest('helper', () => verifyRoundTrip())`
    expect(testVacuityFindings('x.test.ts', source)).toEqual([])
  })

  test('a bare waiver does not disable the guard', () => {
    const source = `// vacuity-allow:\ntest('helper', () => verifyRoundTrip())`
    expect(testVacuityFindings('x.test.ts', source)).toEqual([expect.objectContaining({ message: expect.stringContaining('no assertion') })])
  })

  test('expect modifier chains ending in a matcher count as assertions', () => {
    const source = `test('matchers', async () => { expect(true).not.toBe(false); await expect(Promise.resolve(true)).resolves.toBe(true); await expect(Promise.reject(Error())).rejects.toThrow() })`
    expect(testVacuityFindings('x.test.ts', source)).toEqual([])
  })

  test('the verification helper counts only below scripts/verify', () => {
    const source = `test('verification', () => check('condition', true))`
    expect(testVacuityFindings('scripts/verify/example.test.ts', source)).toEqual([])
    expect(testVacuityFindings('packages/example.test.ts', source)).toEqual([expect.objectContaining({ message: expect.stringContaining('no assertion') })])
  })

  test('the verification helper requires a condition argument', () => {
    const source = `test('verification', () => check('condition'))`
    expect(testVacuityFindings('scripts/verify/example.test.ts', source)).toEqual([
      expect.objectContaining({ message: expect.stringContaining('no assertion') }),
    ])
  })
})
