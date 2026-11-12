import type { DocumentInput } from '@segnavia/format'

const page = { paper: 'a5' as const, margin: { blockStart: 16, blockEnd: 16, inlineStart: 18, inlineEnd: 12 } }

const book = (title: string, html: string, style?: string): DocumentInput => ({
  type: 'document',
  kind: 'book',
  metadata: { title },
  mode: 'paginated',
  settings: { lang: 'en' },
  page,
  ...(style ? { style: { css: style } } : {}),
  children: [
    {
      type: 'division',
      name: 'body',
      children: [{ type: 'section', title, children: [{ type: 'flow', html }] }],
    },
  ],
})

export function slotCopyfitFixture(): DocumentInput {
  const copyText = 'A paragraph long enough to cross page windows while retaining one source slot. '.repeat(180)
  const css = `
    :where(html){font:16px/24px serif}
    :where([data-slot-value="name"],[data-slot-overflow]){display:block;box-sizing:border-box;inline-size:120px;block-size:38px;font-size:32px;line-height:38px;white-space:nowrap;overflow:hidden}
    :where([data-segnavia-book-page="1"] [data-slot-overflow]){inline-size:82px}
    :where([data-segnavia-book-page="2"] [data-slot-overflow]){inline-size:190px}`
  return {
    ...book('Slot copyfit', `<div><span data-slot-value="name">Name</span><p>${copyText}</p></div>`, css),
    data: { slots: [{ key: 'name', label: 'Name', type: 'text', overflow: 'shrink', minSize: 8 }] },
  }
}

const flashcardText = [
  'A',
  'Amber',
  'Blue harbor',
  'Copper lantern',
  'Distant shoreline',
  'Evening navigation',
  'Folding paper compass',
  'Gentle prevailing wind',
  'Harbor lights reflected',
  'Island passage at midnight',
  'Journeys measured by starlight',
  'Keeping watch beside the mast',
  'Longitudes marked in the logbook',
  'Morning tide beneath a cloudless sky',
  'Northern constellations over quiet water',
  'Ocean charts annotated throughout the voyage',
]

export const COPYFIT_GROUP = 'demo-flashcards'

export function groupCopyfitFixture(): DocumentInput {
  const cards = flashcardText
    .map(
      (text, index) =>
        `<p data-segnavia-id="flashcard-${index + 1}" data-fit="size" data-fit-min="10px" data-fit-step="1px" data-fit-axis="inline" data-fit-group="${COPYFIT_GROUP}">${text}</p>`,
    )
    .join('')
  const css =
    ':where(html){font:16px/24px serif}:where(.flashcards){display:grid;grid-template-columns:repeat(2,180px);gap:8px}:where(.flashcards p){box-sizing:border-box;inline-size:180px;block-size:48px;margin:0;font-size:30px;line-height:48px;white-space:nowrap;overflow:visible}'
  return book('Grouped flashcards', `<div class="flashcards">${cards}</div>`, css)
}

export function pageCountCopyfitFixture(fitted: boolean): DocumentInput {
  const fit = fitted ? ' data-fit="size" data-fit-min="16px" data-fit-step="1px" data-fit-axis="block"' : ''
  const text = 'The fitted chapter lays out the same words at the final authored size. '.repeat(150)
  const css = `:where(html){font:16px/24px serif}:where(.page-count-copyfit){box-sizing:border-box;inline-size:320px;block-size:780px;margin:0;font-size:${fitted ? 30 : 16}px;line-height:1.4;overflow:visible}`
  return book(
    fitted ? 'Fitted page count' : 'Authored page count',
    `<p class="page-count-copyfit" data-segnavia-id="page-count-copyfit"${fit}>${text}</p>`,
    css,
  )
}

export function fitLimitFixture(): DocumentInput {
  const css =
    ':where(html){font:16px/24px serif}:where(.fit-limit-probe){box-sizing:border-box;inline-size:60px;block-size:42px;margin:0;font-size:30px;line-height:42px;white-space:nowrap;overflow:visible}'
  return book(
    'Fit limit',
    '<p class="fit-limit-probe" data-segnavia-id="fit-limit-probe" data-fit="size" data-fit-min="28px" data-fit-step="1px" data-fit-axis="inline">This cannot fit</p>',
    css,
  )
}
