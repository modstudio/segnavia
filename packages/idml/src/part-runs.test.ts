import { describe, expect, test } from 'bun:test'
import type { IdmlFindings } from './findings.ts'
import { type IdmlPartMarker, partRuns } from './part-runs.ts'

const findings: IdmlFindings = {
  pages: [
    { id: 'p0', name: '0', spread: 's0', appliedMaster: 'Body', stories: ['front'] },
    { id: 'p1', name: '1', spread: 's1', appliedMaster: 'Open', stories: ['one', 'span'] },
    { id: 'p2', name: '2', spread: 's1', appliedMaster: 'Open', stories: ['span'] },
    { id: 'p3', name: '3', spread: 's2', appliedMaster: 'Open', stories: ['three'] },
  ],
  masters: [{ name: 'Open', pages: ['1', '2', '3'] }],
  sections: [{ name: 'Front', startPage: '0', pages: ['0'] }, { name: 'Body', startPage: '1', pages: ['1', '2', '3'] }],
  paragraphStyles: [{ name: 'Heading', pages: [{ page: '1', count: 1, texts: ['One'] }, { page: '3', count: 1, texts: ['Three'] }] }],
}
const stories = [{ story: 'front', page: '0' }, { story: 'one', page: '1' }, { story: 'span', page: '1' }, { story: 'three', page: '3' }]

describe('partRuns', () => {
  for (const [label, marker, openers] of [
    ['master', { master: 'Open' }, ['1', '3']],
    ['paragraph style', { paragraphStyle: 'Heading' }, ['1', '3']],
    ['section', { section: true }, ['0', '1']],
    ['pages', { pages: ['1', '3'] }, ['1', '3']],
    ['none', { none: true }, []],
  ] as [string, IdmlPartMarker, string[]][]) {
    test(`forms runs for a ${label} marker`, () => {
      expect(partRuns(findings, stories, marker).flatMap((run) => run.openerPage ?? [])).toEqual(openers)
    })
  }

  test('keeps pre-opener stories flat, joins an empty same-spread opener, and assigns a spanning story once', () => {
    expect(partRuns(findings, stories, { master: 'Open' })).toEqual([
      { stories: ['front'] },
      { openerPage: '1', stories: ['one', 'span'] },
      { openerPage: '3', stories: ['three'] },
    ])
  })
})
