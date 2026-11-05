import type { BookInput } from '@segnavia/format'

export const keepProbe = (hebrew: boolean) => {
  const word = hebrew ? 'בְּרֵאשִׁית' : 'WORD'
  return `<div data-keep-probes style="font:16px/1 monospace;inline-size:10ch">
    <div>xxxxx <span data-keep-control>§</span> <span data-keep-control-word>${word}</span></div>
    <div>xxxxx <span data-keep-next style="--segnavia-keep-with:next">§</span> <span data-keep-next-word>${word}</span></div>
    <div>xxxxx <span data-keep-previous-word>${word}</span> <span data-keep-previous style="--segnavia-keep-with:previous">¶</span></div>
  </div>`
}

const blockKeepProbe = (hebrew: boolean) => {
  const next = hebrew ? 'כותרת שמורה' : 'KEPT BLOCK NEXT'
  const after = hebrew ? 'הפסקה הבאה' : 'NEXT BLOCK'
  const before = hebrew ? 'הפסקה הקודמת' : 'PREVIOUS BLOCK'
  const previous = hebrew ? 'סיום שמור' : 'KEPT BLOCK PREVIOUS'
  return `<div style="block-size:160mm"></div><div data-keep-block-next style="margin:0;--segnavia-keep-with:next">${next}</div><p data-keep-block-next-neighbor style="margin:0">${after}</p>
    <div style="block-size:160mm"></div><p data-keep-block-previous-neighbor style="margin:0">${before}</p><div data-keep-block-previous style="margin:0;--segnavia-keep-with:previous">${previous}</div>`
}

export const keepBookFixture = (hebrew: boolean): BookInput => ({
  title: hebrew ? 'ספר שמירות' : 'Keep Book',
  mode: 'paginated',
  lang: hebrew ? 'he' : 'en',
  page: { paper: 'a5', margin: { top: 16, bottom: 16, inner: 18, outer: 12 } },
  css: ':where(html){font:16px/1.5 monospace}',
  chapters: [{ title: hebrew ? 'שמירות' : 'Keeps', html: `${keepProbe(hebrew)}${blockKeepProbe(hebrew)}` }],
})
