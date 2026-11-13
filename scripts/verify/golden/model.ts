export interface GoldenOutlineItem {
  title: string
  page: number
  depth: number
}

export interface GoldenPage {
  size: [number, number]
  text: string
}

export interface GoldenPdf {
  pages: GoldenPage[]
  outline: GoldenOutlineItem[]
  structure: { tree: boolean; marked: boolean }
  fonts: string[]
  info: Record<string, string>
  xmp: string
}

export interface GoldenFixture {
  id: string
  pdf: string
  taggedOutline?: true
}

export const GOLDEN_FIXTURES_DIRECTORY = 'scripts/verify/golden/fixtures'

export const goldenFixturePath = (fixture: GoldenFixture): string => `${GOLDEN_FIXTURES_DIRECTORY}/${fixture.id}.json`

export const GOLDEN_FIXTURES: readonly GoldenFixture[] = [
  { id: 'hebrew-sefer', pdf: 'site/book-paginated-he.pdf' },
  { id: 'english-book', pdf: 'site/book-parts-en.pdf', taggedOutline: true },
  { id: 'records-table', pdf: 'site/book-paginated-en.pdf' },
  { id: 'measured-sheet', pdf: 'page-letter.pdf' },
  { id: 'n-up-cards', pdf: 'pages-two-sided-long.pdf' },
  { id: 'deck', pdf: 'deck.pdf' },
  { id: 'printed-pages-bleed', pdf: 'pages-bleed-grid.pdf' },
  { id: 'pages-sectioned', pdf: 'pages-sectioned.pdf' },
]
