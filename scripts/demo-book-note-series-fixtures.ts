import type { BookInput } from '@segnavia/format'

export function noteSeriesFixture(hebrew: boolean): BookInput {
  const first = hebrew ? 'מקור ראשון' : 'First source'
  const second = hebrew ? 'מקור שני' : 'Second source'
  const comment = hebrew ? 'הערה שנאספה בסוף הספר' : 'A comment collected at the end of the book'
  return {
    title: hebrew ? 'שתי סדרות הערות' : 'Two note series',
    mode: 'paginated',
    lang: hebrew ? 'he' : 'en',
    page: { paper: 'a5', margin: { top: 16, bottom: 16, inner: 18, outer: 12 } },
    notes: [
      {
        name: 'footnote',
        placement: 'page',
        numbering: 'book',
        marker: hebrew ? 'hebrew' : 'symbols',
        title: hebrew ? 'מקורות' : 'Sources',
      },
      {
        name: 'endnote',
        placement: 'book',
        numbering: 'book',
        marker: 'arabic',
        title: hebrew ? 'הערות' : 'Comments',
      },
    ],
    body: [
      {
        title: hebrew ? 'פרק ראשון' : 'Chapter One',
        html: `<h1>${hebrew ? 'פרק ראשון' : 'Chapter One'}</h1><p>${hebrew ? 'הטקסט קורא למקור' : 'The text calls a source'}<span id="first-source" data-note="footnote">${first}</span> ${
          hebrew ? 'ולהערה' : 'and a comment'
        }<span data-note="endnote">${comment}</span>.</p>`,
      },
      {
        title: hebrew ? 'פרק שני' : 'Chapter Two',
        html: `<h1>${hebrew ? 'פרק שני' : 'Chapter Two'}</h1><p>${hebrew ? 'מקור נוסף' : 'Another source'}<span data-note="footnote">${second}</span> ${
          hebrew ? 'וקריאה חוזרת' : 'and the first source again'
        }<a data-note-ref="first-source">${hebrew ? 'שם' : 'there'}</a>.</p>`,
      },
    ],
  }
}

export function twoPageSeriesFixture(hebrew: boolean): BookInput {
  const commentary = hebrew
    ? 'בְּרֵאשִׁית בָּרָא אֱלֹהִים הערה ארוכה השייכת לסדרת הפירוש ונמשכת בעמוד הבא. '.repeat(34)
    : 'A long commentary note belongs to its own series and continues on the next page without joining the source notes. '.repeat(28)
  return {
    title: hebrew ? 'שתי סדרות בתחתית העמוד' : 'Two series at the page foot',
    mode: 'paginated',
    lang: hebrew ? 'he' : 'en',
    page: { paper: 'a5', margin: { top: 16, bottom: 16, inner: 18, outer: 12 } },
    notes: [{ name: 'commentary', placement: 'page', numbering: 'book', marker: 'arabic', title: hebrew ? 'פירוש' : 'Commentary' }],
    body: [
      {
        title: hebrew ? 'פרק ראשון' : 'Chapter One',
        html: `<h1>${hebrew ? 'פרק ראשון' : 'Chapter One'}</h1><p>${
          hebrew ? 'הטקסט קורא למקור קצר' : 'The text calls a short source'
        }<span data-note="footnote">${hebrew ? 'מקור קצר לסדרה הראשונה.' : 'A short source in the first series.'}</span> ${
          hebrew ? 'ולפירוש ארוך' : 'and a long commentary'
        }<span data-note="commentary">${commentary}</span>.</p><p>${
          hebrew ? 'עוד טקסט בעמוד מראה שההערות נשארות בתחתיתו.' : 'More page text shows that both note groups remain at the page foot.'
        }</p>`,
      },
    ],
  }
}
