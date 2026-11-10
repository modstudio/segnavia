import { BOOK_PARENT_NAMES, type ParentPage } from '@segnavia/format'

const markHead = (edge: 'start' | 'end') =>
  `<div class="haggadah-head"><span class="haggadah-kavana" data-motif="segnavia:head-template" data-motif-name="kavana"></span><span class="haggadah-siman haggadah-siman-${edge}" data-motif="segnavia:head-template" data-motif-name="siman"></span></div>`

export const markParents = { recto: 'haggadah-recto', verso: 'haggadah-verso' } as const
export const variableHeadParents = { recto: 'siman-recto', verso: 'siman-verso' } as const

const variableHead = '<div class="segnavia-running-head" data-motif="segnavia:head-template" data-motif-name="siman"></div>'

export const haggadahHeadCss =
  ':where(.haggadah-head){position:relative;block-size:100%;display:flex;align-items:center;justify-content:center}:where(.haggadah-siman){position:absolute}:where(.haggadah-siman-start){inset-inline-start:0}:where(.haggadah-siman-end){inset-inline-end:0}'

export function paginatedParents(footMotifKey?: string): ParentPage[] {
  return [
    { name: 'deep-opener', basedOn: 'segnavia:opener', margin: { blockStart: 34, blockEnd: 16, inlineStart: 18, inlineEnd: 12 } },
    { name: 'haggadah-recto', basedOn: 'segnavia:recto', head: markHead('end') },
    { name: 'haggadah-verso', basedOn: 'segnavia:verso', head: markHead('start') },
    { name: variableHeadParents.recto, basedOn: 'segnavia:recto', head: variableHead },
    { name: variableHeadParents.verso, basedOn: 'segnavia:verso', head: variableHead },
    { name: 'wide-opener', basedOn: 'segnavia:opener', margin: { blockStart: 34, blockEnd: 16, inlineStart: 24, inlineEnd: 18 } },
    { name: 'wide-recto', basedOn: 'haggadah-recto', margin: { blockStart: 16, blockEnd: 16, inlineStart: 24, inlineEnd: 18 } },
    { name: 'wide-verso', basedOn: 'haggadah-verso', margin: { blockStart: 16, blockEnd: 16, inlineStart: 24, inlineEnd: 18 } },
    {
      name: 'ornament-foot',
      basedOn: 'segnavia:blank',
      foot: `<div class="designed-foot"><span class="segnavia-folio" data-motif="segnavia:head-template" data-motif-name="segnavia:folio"></span><span aria-hidden="true"> ❧</span>${footMotifKey ? `<span data-motif="${footMotifKey}"></span>` : ''}</div>`,
    },
  ]
}

// A chapter's pages: blanks stay blank, the first page takes the opener, and the rest alternate.
export function chapterParentRules(opener: string, verso: string, recto: string) {
  return [
    { when: { blank: true }, parent: BOOK_PARENT_NAMES.blank },
    { when: { position: 'sectionFirst' as const }, parent: opener },
    { when: { face: 'verso' as const }, parent: verso },
    { parent: recto },
  ]
}
