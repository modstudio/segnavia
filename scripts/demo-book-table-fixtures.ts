import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { bookFromDocument, type DocumentInput } from '@segnavia/format'
import { bookValueDocument as paginatedBookDocument } from '@segnavia/frame/book-document'
import { newNonce } from '@segnavia/frame/bridge'
import { markdownHtml, parseDocument } from '@segnavia/html'
import { BOOK_STYLE_CHECK_CSS } from './demo-book-fonts.ts'

export const PAGINATED_TABLE_FLOW_IDS = {
  table: 'segnavia-chapter-4',
  wrapped: 'segnavia-wrapped-table',
  margin: 'segnavia-margin-table',
} as const

export function tableFixtureRows(hebrew: boolean, count: number): { html: string; markdown: string } {
  const letters = hebrew ? 'אבגדהוזחטיכלמנסעפצקרשת' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const values = Array.from({ length: count }, (_, index) => ({ letter: letters[index % letters.length], value: index + 1 }))
  return {
    html: values.map(({ letter, value }) => `<tr><td>${letter}</td><td>${value}</td></tr>`).join(''),
    markdown: values.map(({ letter, value }) => `| ${letter} | ${value} |`).join('\n'),
  }
}

export function wrappedTableHtml(hebrew: boolean): string {
  const headings = hebrew ? ['אות עטופה', 'ערך עטוף'] : ['Wrapped letter', 'Wrapped value']
  const rows = tableFixtureRows(hebrew, 46)
  return markdownHtml(`| ${headings[0]} | ${headings[1]} |\n| --- | --- |\n${rows.markdown}`, { dir: hebrew ? 'rtl' : 'ltr', lang: hebrew ? 'he' : 'en' })
}

export function marginTableHtml(hebrew: boolean): string {
  const head = hebrew ? '<th>אות בשוליים</th><th>ערך בשוליים</th>' : '<th>Margin letter</th><th>Margin value</th>'
  return `<table style="margin-top:24px"${hebrew ? ' dir="rtl"' : ''}><thead><tr>${head}</tr></thead><tbody>${tableFixtureRows(hebrew, 46).html}</tbody></table>`
}

export const paginatedTableFixture = (): DocumentInput => ({
  type: 'document',
  kind: 'book',
  metadata: { title: 'טבלאות מחולקות' },
  mode: 'paginated',
  settings: { lang: 'he' },
  style: { css: BOOK_STYLE_CHECK_CSS },
  page: { paper: 'a5', margin: { blockStart: 16, blockEnd: 16, inlineStart: 18, inlineEnd: 12 }, columnGap: 5 },
  rectoOpenings: true,
  children: [
    {
      type: 'division',
      name: 'body',
      children: [
        {
          type: 'section',
          title: 'טבלה עטופה',
          id: PAGINATED_TABLE_FLOW_IDS.wrapped,
          children: [{ type: 'flow', html: wrappedTableHtml(true) }],
        },
        {
          type: 'section',
          title: 'טבלה עם שוליים',
          id: PAGINATED_TABLE_FLOW_IDS.margin,
          children: [{ type: 'flow', html: marginTableHtml(true) }],
        },
      ],
    },
  ],
})

export function writePaginatedTableBook(site: string, css: string): void {
  let id = 0
  const book = bookFromDocument(parseDocument(paginatedTableFixture(), { newId: () => `fixture-${++id}` }))
  writeFileSync(path.join(site, 'book-paginated-tables-he.html'), paginatedBookDocument(book, { nonce: newNonce(), css }))
  writeFileSync(
    path.join(site, 'book-paginated-tables.html'),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Paginated table book</title><style>html,body{margin:0}body{box-sizing:border-box;padding:16px;background:#d9d5cc;font:16px system-ui,sans-serif}.book h2{margin:0 0 8px}iframe{inline-size:100%;block-size:70vh;background:#fff;border:0}</style></head><body><main><section class="book"><h2>טבלאות</h2><iframe id="book-paginated-tables-he" sandbox="allow-scripts" src="book-paginated-tables-he.html"></iframe></section></main></body></html>`,
  )
}
