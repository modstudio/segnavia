import type { BookInput } from '@segnavia/format'

export const keepProbe = (hebrew: boolean) => {
  const word = hebrew ? 'בְּרֵאשִׁית' : 'WORD'
  const image = (attribute: string, keep = false) =>
    `<svg ${attribute} style="display:inline;inline-size:1ch;block-size:1em${keep ? ';--segnavia-keep-with:next' : ''}" viewBox="0 0 16 16"><text y="12">§</text></svg>`
  return `<div data-keep-probes style="font:16px/1 monospace;inline-size:10ch">
    <div data-keep-control-row data-word="${word}">xxxxx <span data-keep-control>§</span> ${word}</div>
    <div data-keep-next-row data-word="${word}">xxxxx <span data-keep-next style="--segnavia-keep-with:next">§</span> ${word}</div>
    <div data-keep-previous-row data-word="${word}">xxxxx ${word} <span data-keep-previous style="--segnavia-keep-with:previous">¶</span></div>
    <div data-keep-image-row data-word="${word}">xxxxx ${image('data-keep-image', true)} ${word}</div>
    <div>xxxxxxxx <span data-keep-before-image style="--segnavia-keep-with:next">§</span> ${image('data-keep-neighbor-image')}</div>
  </div>`
}

const blockKeepProbe = (hebrew: boolean) => {
  const next = hebrew ? 'כותרת שמורה' : 'KEPT BLOCK NEXT'
  const after = hebrew ? 'הפסקה הבאה' : 'NEXT BLOCK'
  const before = hebrew ? 'הפסקה הקודמת' : 'PREVIOUS BLOCK'
  const previous = hebrew ? 'סיום שמור' : 'KEPT BLOCK PREVIOUS'
  return `<div style="block-size:160mm;break-inside:avoid"></div><div data-keep-block-next style="margin:0;line-height:12mm;--segnavia-keep-with:next">${next}</div><p data-keep-block-next-neighbor style="margin:0;line-height:12mm">${after}</p>
    <div style="block-size:150mm;break-inside:avoid"></div><p data-keep-block-previous-neighbor style="margin:0;line-height:12mm">${before}</p><div data-keep-block-previous style="margin:0;line-height:12mm;--segnavia-keep-with:previous">${previous}</div>`
}

export const keepBookFixture = (hebrew: boolean, mode: 'paginated' | 'continuous'): BookInput => ({
  title: hebrew ? 'ספר שמירות' : 'Keep Book',
  mode,
  lang: hebrew ? 'he' : 'en',
  page: { paper: 'a5', margin: { top: 16, bottom: 16, inner: 18, outer: 12 } },
  css: ':where(html){font:16px/1.5 monospace}',
  chapters: [{ title: hebrew ? 'שמירות' : 'Keeps', html: `${keepProbe(hebrew)}${blockKeepProbe(hebrew)}` }],
})
