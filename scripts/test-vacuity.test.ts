import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { testVacuityFindings } from './checks/test-vacuity.ts'

const ROOT = path.resolve(import.meta.dir, '..')
const TEST_FILE = /\.(test|spec)\.[mc]?[jt]sx?$/

function testFiles(): string[] {
  const files = new Set<string>()
  for (const pattern of [
    'packages/**/*.{ts,tsx,js,jsx,mts,mtsx,mjs,mjsx,cts,ctsx,cjs,cjsx}',
    'scripts/**/*.{ts,tsx,js,jsx,mts,mtsx,mjs,mjsx,cts,ctsx,cjs,cjsx}',
  ]) {
    for (const file of new Bun.Glob(pattern).scanSync({ cwd: ROOT })) if (TEST_FILE.test(file)) files.add(file)
  }
  return [...files].sort()
}

describe('test vacuity guard', () => {
  test('every test can fail and every title identifies one test', () => {
    const files = testFiles()
    const findings = files.flatMap((file) =>
      testVacuityFindings(file, readFileSync(path.join(ROOT, file), 'utf8')).map((finding) => `${file}:${finding.line} ${finding.message}`),
    )
    expect(files.length).toBeGreaterThan(0)
    expect(findings).toEqual([])
  })

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

  test('the verification helper counts only below scripts/verify', () => {
    const source = `test('verification', () => check('condition', true))`
    expect(testVacuityFindings('scripts/verify/example.test.ts', source)).toEqual([])
    expect(testVacuityFindings('packages/example.test.ts', source)).toEqual([expect.objectContaining({ message: expect.stringContaining('no assertion') })])
  })
})
