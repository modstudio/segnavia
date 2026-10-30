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
