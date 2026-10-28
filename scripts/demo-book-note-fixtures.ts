import type { BookInput } from '@segnavia/format'

export const FIRST_CHILD_NOTE_COLOR = 'rgb(176, 32, 48)'

export function noteCasesCss(): string {
  return (
    `[data-segnavia-note]:has(.padded-note){padding-top:10px;border-top:6px solid #222}` +
    `[data-segnavia-note]:has(.after-inline)>p:first-of-type{display:contents}` +
    `[data-segnavia-note] p:first-child{color:${FIRST_CHILD_NOTE_COLOR}}`
  )
}

function paddedNote(hebrew: boolean): string {
  const body = hebrew
    ? 'הערת שוליים עם ריפוד ומסגרת נמשכת אל שורה שנייה כדי שאיחור ישמיט דיו.'
    : 'A padded bordered footnote continues onto a second line so a downward shift would clip later ink.'
  return `<span class="padded-note">${body} ${body}</span>`
}

function mixedNote(hebrew: boolean): string {
  const lead = hebrew ? 'טקסט בשורה לפני הבלוק.' : 'Inline text before the block.'
  const block = hebrew
    ? 'הבלוק אחרי הטקסט הפנימי נמשך אל שורה נוספת של ההערה המעורבת.'
    : 'The block after the inline lead continues onto another line of this mixed footnote.'
  return `<span class="after-inline">${lead}</span><p>${block} ${block}</p>`
}

function firstChildNote(hebrew: boolean): string {
  const body = hebrew ? 'הערת פסקה ראשונה שצבעה נבדק בעותק דרך כלל הילד הראשון.' : 'A first-child footnote whose paragraph color is checked on the clone.'
  return `<span class="first-child-note">${body} ${body}</span>`
}

export function noteCasesFixture(hebrew: boolean): BookInput {
  const title = hebrew ? 'הערות בדיקה' : 'Note cases'
  const one = hebrew ? 'פסקה ראשונה' : 'First paragraph'
  const two = hebrew ? 'פסקה שנייה' : 'Second paragraph'
  const three = hebrew ? 'פסקה שלישית' : 'Third paragraph'
  return {
    title,
    mode: 'paginated',
    lang: hebrew ? 'he' : 'en',
    page: { paper: 'a5', margin: { top: 16, bottom: 16, inner: 18, outer: 12 } },
    chapters: [
      {
        title,
        html: `<h1>${title}</h1><p>${one}<span data-note="footnote">${paddedNote(hebrew)}</span></p><p>${two}<span data-note="footnote">${mixedNote(hebrew)}</span></p><p>${three}<span data-note="footnote">${firstChildNote(hebrew)}</span></p>`,
      },
    ],
  }
}
