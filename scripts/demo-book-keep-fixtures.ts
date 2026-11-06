import type { DocumentInput } from '@segnavia/format'

export const keepProbe = (hebrew: boolean) => {
  const word = hebrew ? 'בְּרֵאשִׁית' : 'WORD'
  const previousPrefix = hebrew ? 'xxx' : 'xxxxx'
  const image = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%228%22 height=%228%22%3E%3Cpath d=%22M0 0h8v8H0z%22/%3E%3C/svg%3E'
  return `<div data-keep-probes style="font:16px/1 monospace;inline-size:10ch">
    <div data-keep-control-row data-word="${word}">xxxxx <span data-keep-control>§</span> ${word}</div>
    <div data-keep-next-row data-word="${word}">xxxxx <span data-keep-next style="--segnavia-keep-with:next">§</span> ${word}</div>
    <div data-keep-previous-row data-word="${word}">${previousPrefix} ${word} <span data-keep-previous style="--segnavia-keep-with:previous">¶</span></div>
    <div data-keep-image-row data-word="${word}">xxxxx <img data-keep-image style="display:inline;--segnavia-keep-with:next" src="${image}" alt="§"> ${word}</div>
    <div>xxxxxxxx <span data-keep-before-image style="--segnavia-keep-with:next">§</span> <img data-keep-neighbor-image style="display:inline" src="${image}" alt="§"></div>
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

export const keepBookFixture = (hebrew: boolean, mode: 'paginated' | 'continuous'): DocumentInput => ({
  type: 'document',
  kind: 'book',
  metadata: { title: hebrew ? 'ספר שמירות' : 'Keep Book' },
  mode,
  settings: { lang: hebrew ? 'he' : 'en' },
  page: { paper: 'a5', margin: { blockStart: 16, blockEnd: 16, inlineStart: 18, inlineEnd: 12 } },
  style: { css: ':where(html){font:16px/1.5 monospace}' },
  children: [
    {
      type: 'division',
      name: 'body',
      children: [
        {
          type: 'section',
          title: hebrew ? 'שמירות' : 'Keeps',
          children: [{ type: 'flow', html: `${keepProbe(hebrew)}${blockKeepProbe(hebrew)}` }],
        },
      ],
    },
  ],
})
