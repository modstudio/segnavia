import type { DocumentInput } from '@segnavia/format'
import { markdownHtml } from '@segnavia/html'
import { BOOK_STYLE_CHECK_CSS } from './demo-book-fonts.ts'
import { BOOK_FOLIO_MOTIF_KEY } from './demo-book-motifs.ts'
import { paginatedParents } from './demo-book-parents.ts'

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
  parentPages: paginatedParents(BOOK_FOLIO_MOTIF_KEY).map(({ margin, ...parent }) => ({ type: 'parentPage', ...parent, geometry: { margin } })),
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
