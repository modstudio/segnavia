import { expect, test } from 'bun:test'
import { authoredSectionAttributeIssues, designedSectionAttributeIssues } from './book-held.ts'

test('reports fill vocabulary on designed and authored pages where no fill region runs', () => {
  const designed = designedSectionAttributeIssues(
    {
      id: 'designed',
      kind: 'designed',
      title: 'Designed',
      contents: false,
      pages: [{ html: '<main data-region="false"><p data-overflow="truncate">Art</p></main>' }],
    },
    'designed',
  ).join(' ')
  expect(designed).toContain('section Designed page 1 <p> data-overflow is not on a named template or parent-page region element')
  expect(authoredSectionAttributeIssues({ title: 'Authored', html: '<p data-fill="repeat">Text</p>' }, 'authored').join(' ')).toContain(
    'section Authored <p> data-fill is outside a named template or parent-page region',
  )
})
