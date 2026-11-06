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
  fonts: string[]
  info: Record<string, string>
  xmp: string
}

export interface GoldenFixture {
  id: string
  pdf: string
  golden: string
}

export const GOLDEN_FIXTURES: readonly GoldenFixture[] = [
  { id: 'hebrew-sefer', pdf: 'out/site/book-paginated-he.pdf', golden: 'scripts/verify/golden/fixtures/hebrew-sefer.json' },
  { id: 'english-book', pdf: 'out/site/book-parts-en.pdf', golden: 'scripts/verify/golden/fixtures/english-book.json' },
  { id: 'records-table', pdf: 'out/site/book-paginated-en.pdf', golden: 'scripts/verify/golden/fixtures/records-table.json' },
  { id: 'measured-sheet', pdf: 'out/page-letter.pdf', golden: 'scripts/verify/golden/fixtures/measured-sheet.json' },
  { id: 'n-up-cards', pdf: 'out/pages-two-sided-long.pdf', golden: 'scripts/verify/golden/fixtures/n-up-cards.json' },
  { id: 'deck', pdf: 'out/deck.pdf', golden: 'scripts/verify/golden/fixtures/deck.json' },
  { id: 'printed-pages-bleed', pdf: 'out/pages-bleed-grid.pdf', golden: 'scripts/verify/golden/fixtures/printed-pages-bleed.json' },
]
