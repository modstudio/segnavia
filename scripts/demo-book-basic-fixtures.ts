import type { DocumentInput } from '@segnavia/format'
import { BOOK_CSS } from './demo-book-fonts.ts'
import { keepProbe } from './demo-book-keep-fixtures.ts'
import { BOOK_MOTIF_KEY } from './demo-book-motifs.ts'

const section = (id: string, title: string, html: string, contents = true) => ({
  type: 'section' as const,
  id,
  title,
  contents,
  children: [{ type: 'flow' as const, html }],
})

export const basicBookFixture = (hebrew: boolean): DocumentInput => ({
  type: 'document',
  kind: 'book',
  metadata: { title: hebrew ? 'ספר ההפלגה' : 'The Book of Tides' },
  mode: 'continuous',
  settings: { lang: hebrew ? 'he' : 'en' },
  style: { css: BOOK_CSS },
  children: [
    {
      type: 'division',
      name: 'front',
      children: [
        section('segnavia-front-1', hebrew ? 'שער' : 'Title page', `<h1>${hebrew ? 'ספר ההפלגה' : 'The Book of Tides'}</h1><p data-motif="${BOOK_MOTIF_KEY}"></p>`, false),
        { type: 'contents', id: 'segnavia-contents', title: hebrew ? 'תוכן' : 'Contents' },
      ],
    },
    {
      type: 'division',
      name: 'body',
      children: [
        section(
          'segnavia-chapter-1',
          hebrew ? 'התחלה' : 'Beginning',
          `<h1>${hebrew ? 'התחלה' : 'Beginning'}</h1><p class="note-paragraph book-css-check">${
            hebrew ? 'הספינה יצאה אל הים' : 'The ship went out with the morning tide'
          }<span data-note="footnote">${hebrew ? 'הערת שוליים על ההפלגה.' : 'A footnote about the voyage.'}</span>.</p>${keepProbe(hebrew)}<p>${
            hebrew ? 'ראו עמ׳ ' : 'See page '
          }<a href="#far-shore" data-ref="page"></a>.</p>`,
        ),
        section(
          'segnavia-chapter-2',
          hebrew ? 'החוף הרחוק' : 'The Far Shore',
          `<h1 id="far-shore">${hebrew ? 'החוף הרחוק' : 'The Far Shore'}</h1><p class="note-paragraph">${
            hebrew ? 'בקצה המסע נמצא חוף חדש' : 'At the end of the crossing was another shore'
          }<span data-note="endnote">${hebrew ? 'מקור להערת הסיום.' : 'The source for the endnote.'}</span>.</p>`,
        ),
      ],
    },
  ],
})

export const composeFailureFixture = (): DocumentInput => ({
  type: 'document',
  kind: 'book',
  metadata: { title: 'The Book Beyond the Page Limit' },
  mode: 'paginated',
  page: { paper: 'a5', margin: { blockStart: 16, blockEnd: 16, inlineStart: 18, inlineEnd: 12 } },
  rectoOpenings: true,
  children: [
    { type: 'division', name: 'body', children: Array.from({ length: 251 }, (_, index) => section(`compose-${index + 1}`, `Chapter ${index + 1}`, `<p>Chapter ${index + 1}</p>`)) },
  ],
})
