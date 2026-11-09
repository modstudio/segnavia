import { describe, expect, test } from 'bun:test'
import { pageGeometryIssues } from './document-page-geometry-policy.ts'

describe('page geometry policy', () => {
  test('names the unknown geometry and both clearances', () => {
    expect(
      pageGeometryIssues([{ label: 'Chapter (chapter)', path: ['body', 0], pageGeometry: 'missing', declaredNames: ['wide'], mode: 'paginated' }]),
    ).toEqual([
      {
        path: ['body', 0, 'pageGeometry'],
        message:
          'Section "Chapter (chapter)" names unknown page geometry "missing"; declare it in style.pageGeometries, or remove pageGeometry to clear this refusal.',
      },
    ])
  })

  test('refuses a named geometry in continuous flow with both clearances', () => {
    expect(pageGeometryIssues([{ label: 'Chapter', path: ['children', 0], pageGeometry: 'wide', declaredNames: ['wide'], mode: 'continuous' }])).toEqual([
      {
        path: ['children', 0, 'pageGeometry'],
        message: 'Section "Chapter" sets pageGeometry in a continuous book; use paginated layout, or remove pageGeometry to clear this refusal.',
      },
    ])
  })
})
