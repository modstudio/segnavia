import { describe, expect, test } from 'bun:test'
import { fontCoverageGaps } from './font-coverage.ts'

describe('fontCoverageGaps', () => {
  test('covers a declared weight band by the union of supplied bands', () => {
    expect(fontCoverageGaps({ weight: [100, 900] }, [{ weight: 100 }, { weight: 900 }])).toEqual([{ weight: [101, 899] }])
    expect(fontCoverageGaps({ weight: [100, 900] }, [{ weight: '100 900' }])).toEqual([])
    expect(fontCoverageGaps({ weight: [100, 900] }, [{ weight: '100 500' }, { weight: '400 900' }])).toEqual([])
  })

  test('covers a declared code-point set by value', () => {
    expect(
      fontCoverageGaps(
        { unicodeRange: 'U+0000-05FF' },
        [{ unicodeRange: 'u+0000-00ff' }, { unicodeRange: 'U+01??,U+0200-05FF,U+0180-02FF' }],
      ),
    ).toEqual([])
    expect(fontCoverageGaps({ unicodeRange: 'U+0000-05FF' }, [{ unicodeRange: 'U+0000-00FF,U+0200-05FF' }])).toEqual([
      { weight: 400, unicodeRange: 'U+0100-01FF' },
    ])
  })

  test('combines weight and code-point coverage and merges equal adjacent slices', () => {
    const declaration = { weight: [100, 900] as const, style: 'italic', unicodeRange: 'U+0000-01FF' }
    const faces = [
      { weight: '100 300', style: 'italic', unicodeRange: 'U+0000-00FF' },
      { weight: '301 700', style: 'italic', unicodeRange: 'U+0000-01FF' },
      { weight: '701 900', style: 'italic', unicodeRange: 'U+0000-00FF' },
    ]
    const expected = [
      { weight: [100, 300], style: 'italic', unicodeRange: 'U+0100-01FF' },
      { weight: [701, 900], style: 'italic', unicodeRange: 'U+0100-01FF' },
    ]
    expect(fontCoverageGaps(declaration, faces)).toEqual(expected)
    expect(fontCoverageGaps(declaration, [...faces].reverse())).toEqual(expected)
  })

  test('uses CSS defaults and reports the uncovered part of an unrestricted declaration', () => {
    expect(fontCoverageGaps({}, [{}])).toEqual([])
    expect(fontCoverageGaps({}, [])).toEqual([{ weight: 400 }])
    expect(fontCoverageGaps({}, [{ unicodeRange: 'U+0000-00FF' }])).toEqual([{ weight: 400, unicodeRange: 'U+0100-10FFFF' }])
  })

  test('reports a Hebrew declaration not covered by a Latin face', () => {
    expect(fontCoverageGaps({ unicodeRange: 'U+0590-05FF' }, [{ unicodeRange: 'U+0000-007F' }])).toEqual([
      { weight: 400, unicodeRange: 'U+0590-05FF' },
    ])
  })
})
