import type { DocumentInput } from '@segnavia/format'

export interface BookRenderFixture {
  key: 'english' | 'hebrew'
  document: DocumentInput
  chapterTitles: string[]
  css: string
  contentsTitle: string
  frontTitle: string
  frontMarker: string
  chapterMarkers: string[]
  runningHeads: string[]
  endnotesTitle: string
}

const topics = (key: string, chapter: number) =>
  `<div class="topics">${Array.from({ length: 6 }, (_, index) => `<h2>${key}-${chapter}-H2-${index}</h2><h3>${key}-${chapter}-H3-${index}</h3>`).join('')}<h2 data-contents="exclude">EXCLUDED-${key}-${chapter}</h2></div>`

export function bookRenderFixture(key: 'english' | 'hebrew'): BookRenderFixture {
  const hebrew = key === 'hebrew'
  const tag = hebrew ? 'HE' : 'EN'
  const chapterMarkers = [`OPEN${tag}1`, `OPEN${tag}2`, `OPEN${tag}3`]
  const runningHeads = hebrew ? ['ראשון', 'שני', 'שלישי'] : ['RUNEN1', 'RUNEN2', 'RUNEN3']
  const sections = [
    {
      type: 'section' as const,
      title: hebrew ? 'פרק ראשון' : 'Chapter One',
      children: [
        {
          type: 'flow' as const,
          runningHead: runningHeads[0],
          html: `<p>${chapterMarkers[0]}<span data-note="footnote">FOOT-${tag}</span></p><p>B2F-${tag}[<a href="#pdf-front-ref-target" data-ref="page"></a>]</p><p>REF-${tag}[<a href="#pdf-page-ref-target" data-ref="page"></a>]</p><p class="margin-probe"><span>MARGIN-L-${tag}-1</span><span>MARGIN-R-${tag}-1</span></p>${topics(tag, 1)}<div class="second-page">SECOND${tag}1<p class="margin-probe"><span>MARGIN-L-${tag}-2</span><span>MARGIN-R-${tag}-2</span></p></div>`,
        },
      ],
    },
    {
      type: 'section' as const,
      title: hebrew ? 'פרק שני' : 'Chapter Two',
      children: [{ type: 'flow' as const, runningHead: runningHeads[1], html: `<p>${chapterMarkers[1]}</p>${topics(tag, 2)}` }],
    },
    {
      type: 'section' as const,
      title: hebrew ? 'פרק שלישי' : 'Chapter Three',
      children: [
        {
          type: 'flow' as const,
          runningHead: runningHeads[2],
          html: `<p id="pdf-page-ref-target">${chapterMarkers[2]}<span data-note="endnote">END-${tag}</span></p>${topics(tag, 3)}`,
        },
      ],
    },
  ]
  return {
    key,
    document: {
      type: 'document',
      kind: 'book',
      metadata: {
        title: hebrew ? 'ספר בדיקה' : 'Test Book',
        authors: hebrew ? ['לאה כהן', 'David Levi'] : ['Ada Lovelace', 'Charles Babbage'],
        subject: hebrew ? 'בדיקת מבנה & מידע' : 'Structure & metadata verification',
      },
      mode: 'continuous',
      settings: { lang: hebrew ? 'he' : 'en' },
      page: { paper: 'a5', orientation: 'portrait', margin: { blockStart: 15, blockEnd: 15, inlineStart: 20, inlineEnd: 12 } },
      rectoOpenings: true,
      children: [
        {
          type: 'division',
          name: 'front',
          children: [
            {
              type: 'section',
              title: hebrew ? 'פתיחה' : 'Front',
              children: [
                { type: 'flow', html: `<p id="pdf-front-ref-target">FRONT${tag}</p><p>F2B-${tag}[<a href="#pdf-page-ref-target" data-ref="page"></a>]</p>` },
              ],
            },
            { type: 'contents', title: hebrew ? 'תוכן' : 'Contents' },
          ],
        },
        { type: 'division', name: 'body', children: sections },
      ],
    },
    chapterTitles: sections.map((section) => section.title),
    css: ':where(body){font:12px serif}:where(.topics h2,.topics h3){font-size:1px;line-height:1px;margin:0}:where(.second-page){break-before:page}:where(.margin-probe){display:flex;justify-content:space-between;direction:ltr}:where(.segnavia-contents-entry){line-height:8mm}',
    contentsTitle: hebrew ? 'תוכן' : 'Contents',
    frontTitle: hebrew ? 'פתיחה' : 'Front',
    frontMarker: `FRONT${tag}`,
    chapterMarkers,
    runningHeads,
    endnotesTitle: hebrew ? 'הערות' : 'Notes',
  }
}
