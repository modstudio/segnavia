import { describe, expect, test } from 'bun:test'
import path from 'node:path'
import { goldenRecordingPaths } from './record.ts'

describe('golden PDF recorder', () => {
  test('reads fixture PDFs from a downloaded demo out tree', () => {
    const paths = goldenRecordingPaths('/tmp/downloaded-demo')
    expect(paths.map(({ fixture, source }) => [fixture.id, source])).toContainEqual(['deck', path.join('/tmp/downloaded-demo', 'deck.pdf')])
    expect(paths.map(({ fixture, source }) => [fixture.id, source])).toContainEqual([
      'hebrew-sefer',
      path.join('/tmp/downloaded-demo', 'site/book-paginated-he.pdf'),
    ])
  })
})
