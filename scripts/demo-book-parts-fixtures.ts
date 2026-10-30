import type { BookInput } from '@segnavia/format'

export const partBookLabels = (hebrew: boolean) => ({
  openingPart: hebrew ? 'שער ראשון' : 'Opening Part',
  titleOnlyPart: hebrew ? 'שער שני' : 'Title-only Part',
  appendixPart: hebrew ? 'נספח' : 'Appendix',
  chapterOne: hebrew ? 'פרק ראשון' : 'Chapter One',
  chapterTwo: hebrew ? 'פרק שני' : 'Chapter Two',
  chapterThree: hebrew ? 'פרק שלישי' : 'Chapter Three',
  appendix: hebrew ? 'אחרית דבר' : 'Afterword',
  topic: hebrew ? 'נושא' : 'Topic',
})

export function partsFixture(hebrew: boolean): BookInput {
  const labels = partBookLabels(hebrew)
  const body = hebrew ? 'טקסט לספר שנמשך על פני כמה עמודים. ' : 'Book text that continues across several pages. '
  return {
    title: hebrew ? 'ספר השערים' : 'The Book of Parts',
    authors: [hebrew ? 'מחברת' : 'Author'],
    subject: hebrew ? 'בדיקת שערים' : 'Parts verification',
    mode: 'paginated',
    lang: hebrew ? 'he' : 'en',
    page: { paper: 'a5', margin: { top: 16, bottom: 16, inner: 18, outer: 12 } },
    rectoOpenings: true,
    runningHead: { recto: { part: 'part' }, verso: 'title' },
    frontMatter: [
      { title: hebrew ? 'הקדמה' : 'Preface', html: `<p data-parts-front>${body.repeat(900)}</p>` },
      { kind: 'contents', title: hebrew ? 'תוכן' : 'Contents' },
    ],
    body: [
      {
        name: 'part',
        title: labels.openingPart,
        html: `<h1>${labels.openingPart}</h1><p data-parts-opening>PART_OPENING</p>`,
        children: [{ title: labels.chapterOne, html: `<h2>${labels.topic} 1</h2><p>${body.repeat(700)}</p>` }],
      },
      {
        name: 'part',
        title: labels.titleOnlyPart,
        children: [
          { title: labels.chapterTwo, html: `<h2>${labels.topic} 2</h2><p>${body.repeat(700)}</p>` },
          { title: labels.chapterThree, html: `<h2>${labels.topic} 3</h2><p>${body.repeat(120)}</p>` },
        ],
      },
    ],
    endMatter: [
      {
        name: 'part',
        title: labels.appendixPart,
        children: [{ title: labels.appendix, html: `<h2>${labels.topic} 4</h2><p data-parts-end>${body.repeat(120)}</p>` }],
      },
    ],
  }
}
