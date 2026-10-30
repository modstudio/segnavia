import type { ParentPage } from '@segnavia/format'

const markHead = (edge: 'start' | 'end') =>
  `<div class="haggadah-head"><span class="haggadah-kavana" data-motif="segnavia:mark" data-motif-name="kavana"></span><span class="haggadah-siman haggadah-siman-${edge}" data-motif="segnavia:mark" data-motif-name="siman"></span></div>`

export const markParents = { recto: 'haggadah-recto', verso: 'haggadah-verso' } as const

export const haggadahHeadCss =
  ':where(.haggadah-head){position:relative;block-size:100%;display:flex;align-items:center;justify-content:center}:where(.haggadah-siman){position:absolute}:where(.haggadah-siman-start){inset-inline-start:0}:where(.haggadah-siman-end){inset-inline-end:0}'

export function paginatedParents(footMotifKey?: string): ParentPage[] {
  return [
    { name: 'deep-opener', basedOn: 'segnavia:opener', margin: { top: 34, bottom: 16, inner: 18, outer: 12 } },
    { name: 'haggadah-recto', basedOn: 'segnavia:recto', head: markHead('end') },
    { name: 'haggadah-verso', basedOn: 'segnavia:verso', head: markHead('start') },
    { name: 'wide-opener', basedOn: 'segnavia:opener', margin: { top: 34, bottom: 16, inner: 24, outer: 18 } },
    { name: 'wide-recto', basedOn: 'haggadah-recto', margin: { top: 16, bottom: 16, inner: 24, outer: 18 } },
    { name: 'wide-verso', basedOn: 'haggadah-verso', margin: { top: 16, bottom: 16, inner: 24, outer: 18 } },
    {
      name: 'ornament-foot',
      basedOn: 'segnavia:blank',
      foot: `<div class="designed-foot"><span class="segnavia-folio" data-motif="segnavia:folio"></span><span aria-hidden="true"> ❧</span>${footMotifKey ? `<span data-motif="${footMotifKey}"></span>` : ''}</div>`,
    },
  ]
}
