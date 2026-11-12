import type { DocumentInput } from '@segnavia/format'

const pointed = 'בְּרֵאשִׁ֖ית'
const base = (title: string, template: string, html: string, region: string): DocumentInput => ({
  type: 'document',
  kind: 'book',
  metadata: { title },
  mode: 'paginated',
  settings: { lang: 'he' },
  page: { paper: 'a5', margin: { blockStart: 16, blockEnd: 16, inlineStart: 16, inlineEnd: 16 } },
  templates: [{ type: 'template', name: 'practice', html: template }],
  children: [
    {
      type: 'division',
      name: 'body',
      children: [
        {
          type: 'section',
          title,
          template: 'practice',
          children: [{ type: 'page', regions: { [region]: html } }],
        },
      ],
    },
  ],
})

export const fillFixture = (): DocumentInput =>
  base(
    'תרגול חוזר',
    '<main data-region="rows" style="box-sizing:border-box;block-size:140px;overflow:visible"></main>',
    `<p data-fill="repeat" data-fill-min="2" data-fill-max="20" style="box-sizing:border-box;block-size:24px;margin:0">${pointed}</p>`,
    'rows',
  )

export const truncateFixture = (): DocumentInput =>
  base(
    'קיטום שורות',
    '<main data-region="rows" data-overflow="truncate" style="box-sizing:border-box;block-size:72px;overflow:visible"></main>',
    Array.from(
      { length: 55 },
      (_, index) => `<p style="box-sizing:border-box;block-size:24px;margin:0" data-segnavia-id="drop-${index + 1}">${pointed} ${index + 1}</p>`,
    ).join(''),
    'rows',
  )

export const refuseOverflowFixture = (): DocumentInput =>
  base(
    'סירוב גלישה',
    '<main data-region="rows" data-overflow="refuse" style="box-sizing:border-box;block-size:48px;overflow:visible"></main>',
    Array.from({ length: 4 }, (_, index) => `<p style="box-sizing:border-box;block-size:24px;margin:0">${pointed} ${index + 1}</p>`).join(''),
    'rows',
  )
