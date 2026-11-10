import type { DocumentInput } from '@segnavia/format'

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

export function partsFixture(hebrew: boolean): DocumentInput {
  const labels = partBookLabels(hebrew)
  const body = hebrew ? 'טקסט לספר שנמשך על פני כמה עמודים. ' : 'Book text that continues across several pages. '
  const section = (title: string, html: string) => ({ type: 'section' as const, title, children: [{ type: 'flow' as const, html }] })
  return {
    type: 'document',
    kind: 'book',
    metadata: {
      title: hebrew ? 'ספר השערים' : 'The Book of Parts',
      authors: [hebrew ? 'מחברת' : 'Author'],
      subject: hebrew ? 'בדיקת שערים' : 'Parts verification',
    },
    mode: 'paginated',
    settings: { lang: hebrew ? 'he' : 'en' },
    page: { paper: 'a5', margin: { blockStart: 16, blockEnd: 16, inlineStart: 18, inlineEnd: 12 } },
    rectoOpenings: true,
    variables: [{ type: 'variable', name: 'part', kind: 'text', from: 'part-title', part: 'part' }],
    headTemplates: [{ type: 'headTemplate', name: 'part', parts: [{ variable: 'part' }] }],
    parentPages: [
      {
        type: 'parentPage',
        name: 'part-recto',
        basedOn: 'segnavia:recto',
        regions: {
          head: { edge: 'blockStart', html: '<div class="segnavia-running-head" data-motif="segnavia:head-template" data-motif-name="part"></div>' },
        },
      },
    ],
    parentRules: [
      { when: { blank: true }, parent: 'segnavia:blank' },
      { when: { position: 'sectionFirst' }, parent: 'segnavia:opener' },
      { when: { face: 'verso' }, parent: 'segnavia:verso' },
      { parent: 'part-recto' },
    ],
    children: [
      {
        type: 'division',
        name: 'front',
        children: [
          section(hebrew ? 'הקדמה' : 'Preface', `<p data-parts-front>${body.repeat(900)}</p>`),
          { type: 'contents', title: hebrew ? 'תוכן' : 'Contents' },
        ],
      },
      {
        type: 'division',
        name: 'body',
        children: [
          {
            type: 'part',
            name: 'part',
            title: labels.openingPart,
            html: `<h1>${labels.openingPart}</h1><p data-parts-opening>PART_OPENING</p>`,
            children: [section(labels.chapterOne, `<h2>${labels.topic} 1</h2><p>${body.repeat(700)}</p>`)],
          },
          {
            type: 'part',
            name: 'part',
            title: labels.titleOnlyPart,
            children: [
              section(labels.chapterTwo, `<h2>${labels.topic} 2</h2><p>${body.repeat(700)}</p>`),
              section(labels.chapterThree, `<h2>${labels.topic} 3</h2><p>${body.repeat(120)}</p>`),
            ],
          },
        ],
      },
      {
        type: 'division',
        name: 'end',
        children: [
          {
            type: 'part',
            name: 'part',
            title: labels.appendixPart,
            children: [section(labels.appendix, `<h2>${labels.topic} 4</h2><p data-parts-end>${body.repeat(120)}</p>`)],
          },
        ],
      },
    ],
  }
}
