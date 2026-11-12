import type { DocumentInput } from '@segnavia/format'

export const workbookCss =
  ':where(.lesson){box-sizing:border-box;inline-size:100%;block-size:100%;padding-block:12px;padding-inline:12px;display:flex;flex-direction:column;gap:8px}:where(.lesson-heading){font-weight:700}:where(.lesson-reading){flex:none;block-size:3em;max-block-size:3em;overflow:visible}:where(.lesson-table table){inline-size:100%;border-collapse:collapse}:where(.lesson-table th,.lesson-table td){border:1px solid;padding:4px}:where(.copyright-page){box-sizing:border-box;inline-size:100%;block-size:100%;padding:24px}:where(.lesson-alt .lesson-table){order:-1}:where(.lesson-fit){flex:none;overflow:visible}:where(.lesson-fit p){margin:0;line-height:inherit}'

const lessonHtml = (alt: boolean) =>
  `<div class="lesson${alt ? ' lesson-alt' : ''}"><div class="lesson-heading" data-region="heading"></div><div class="lesson-reading" data-region="reading-text" style="block-size:3em;max-block-size:3em;overflow:visible"></div><div class="lesson-table" data-region="table" dir="rtl"></div></div>`

const fitHtml =
  '<div class="lesson"><div class="lesson-heading" data-region="heading"></div><div class="lesson-fit" data-region="lesson-text" data-fit="size, leading" data-fit-min="48pt, 1.1" data-fit-step="1pt, 0.05" data-fit-axis="both" data-pointed style="font-size:75pt;line-height:1.35;block-size:90pt;max-block-size:90pt;overflow:visible;white-space:nowrap"></div></div>'

function lessonTable(hebrew: boolean): string {
  const head = hebrew ? '<th>אות</th><th>ערך</th>' : '<th>Letter</th><th>Value</th>'
  return `<table><thead><tr>${head}</tr></thead><tbody><tr><td>א</td><td>1</td></tr><tr><td>ב</td><td>2</td></tr></tbody></table>`
}

function lessonPage(hebrew: boolean, n: number, reading: string, template?: string) {
  const lesson = hebrew ? 'שיעור' : 'Lesson'
  return {
    ...(template ? { template } : {}),
    regions: {
      heading: `<h1 id="lesson-${n}">${lesson} ${n}</h1>`,
      'reading-text': `<p>${reading}</p>`,
      table: lessonTable(hebrew),
    },
  }
}

export function workbookFixture(hebrew: boolean): DocumentInput {
  const lesson = hebrew ? 'שיעור' : 'Lesson'
  const reading = hebrew ? 'הטקסט לקריאה בשיעור.' : 'The reading text for this lesson.'
  const longReading = `${reading} `.repeat(8)
  const fitted = hebrew ? 'שָׁלוֹם' : 'Peace'
  return {
    type: 'document',
    kind: 'book',
    metadata: { title: hebrew ? 'חוברת הקריאה' : 'The Reading Workbook' },
    mode: 'paginated',
    settings: { lang: hebrew ? 'he' : 'en' },
    page: { paper: 'a5', margin: { blockStart: 16, blockEnd: 16, inlineStart: 18, inlineEnd: 12 } },
    rectoOpenings: true,
    data: { slots: [{ key: 'school', label: hebrew ? 'בית ספר' : 'School', type: 'text', required: true }] },
    templates: [
      { type: 'template', name: 'lesson', html: lessonHtml(false) },
      { type: 'template', name: 'lesson-alt', html: lessonHtml(true) },
      { type: 'template', name: 'lesson-fit', html: fitHtml },
    ],
    children: [
      {
        type: 'division',
        name: 'front',
        children: [
          {
            type: 'section',
            title: hebrew ? 'זכויות יוצרים' : 'Copyright',
            children: [
              {
                type: 'page',
                body: { html: `<div class="copyright-page"><p>© <span data-slot-value="school">${hebrew ? 'בית ספר' : 'School'}</span></p></div>` },
              },
            ],
          },
          { type: 'contents', title: hebrew ? 'תוכן' : 'Contents' },
        ],
      },
      {
        type: 'division',
        name: 'body',
        children: [
          {
            type: 'section',
            title: hebrew ? 'שיעורים' : 'Lessons',
            template: 'lesson',
            children: [
              { type: 'page', ...lessonPage(hebrew, 1, reading) },
              { type: 'page', ...lessonPage(hebrew, 2, longReading) },
              { type: 'page', ...lessonPage(hebrew, 3, reading, 'lesson-alt') },
              {
                type: 'page',
                template: 'lesson-fit',
                regions: { heading: `<h1 id="lesson-4">${lesson} 4</h1>`, 'lesson-text': fitted },
              },
            ],
          },
        ],
      },
    ],
  }
}
