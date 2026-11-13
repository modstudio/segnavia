import { expect, test } from 'bun:test'
import { printedSectionPapers } from './printed-page-geometries.ts'

const source = {
  print: { paper: 'letter' as const, orientation: 'portrait' as const, margin: undefined, bleed: 0, safe: 0, marks: false, markColor: 'black' as const },
  style: {
    pageGeometries: {
      wide: {
        paper: 'letter' as const,
        orientation: 'landscape' as const,
        margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 },
      },
    },
  },
  printedPages: {
    parents: [],
    sections: [
      { id: 'cover', pages: [{}, {}] },
      { id: 'body', title: 'Body', pageGeometry: 'wide' },
    ],
  },
}

test('expands printed sections into their composed papers and orientations', () => {
  expect(printedSectionPapers(source)).toMatchObject([
    { section: 'cover', paper: { width: 215.9, height: 279.4 }, print: { orientation: 'portrait' } },
    { section: 'cover', paper: { width: 215.9, height: 279.4 }, print: { orientation: 'portrait' } },
    { section: 'body', pageGeometry: 'wide', paper: { width: 279.4, height: 215.9 }, print: { orientation: 'landscape' } },
  ])
})

test('refuses an undeclared printed section geometry by section and name', () => {
  expect(() => printedSectionPapers({ ...source, printedPages: { parents: [], sections: [{ id: 'missing', pageGeometry: 'large' }] } })).toThrow(
    'Section "missing" names unknown page geometry "large"; declare it in style.pageGeometries, or remove pageGeometry to clear this refusal.',
  )
})
