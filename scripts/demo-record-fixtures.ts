import type { DocumentInput } from '@segnavia/format'

const margin = { blockStart: 18, blockEnd: 18, inlineStart: 18, inlineEnd: 18 }
const slot = (key: string, label: string) => ({ key, label, type: 'text' as const })

export const recordsTableDocument: DocumentInput = {
  type: 'document',
  kind: 'printed',
  settings: { lang: 'en' },
  print: { paper: 'letter' },
  parentPages: [
    {
      type: 'parentPage',
      name: 'body',
      geometry: { margin },
      head: '<header>Record <span data-slot-value="record.index"></span> of <span data-slot-value="record.count"></span></header>',
      foot: '<footer>Page <span data-slot-value="printedPage.number"></span> of <span data-slot-value="printedPage.total"></span></footer>',
    },
  ],
  parentRules: [{ parent: 'body' }],
  templates: [
    {
      type: 'template',
      name: 'row',
      slots: [slot('name', 'Name'), slot('amount', 'Amount'), slot('note', 'Note')],
      html: '<style>body{font:18px sans-serif}p{line-height:1.45}</style><h1 data-slot-value="name"></h1><p data-slot-value="amount"></p><p data-slot-value="note"></p>',
    },
  ],
  children: Array.from({ length: 200 }, (_, offset) => {
    const index = offset + 1
    return {
      type: 'record' as const,
      id: `record-${index}`,
      template: 'row',
      values: {
        name: `Record name ${index}`,
        amount: `$${index}.00`,
        note: index % 50 === 0 ? Array.from({ length: 230 }, () => `Long note ${index}.`).join(' ') : `Short note ${index}.`,
      },
    }
  }),
}

const hebrewWords = (count: number) => Array.from({ length: count }, (_, index) => `מילה${index + 1}`).join(' ')

export const hebrewRecordsDocument: DocumentInput = {
  type: 'document',
  kind: 'printed',
  settings: { lang: 'he', dir: 'rtl' },
  numbering: 'hebrew',
  print: { paper: 'letter' },
  parentPages: [
    {
      type: 'parentPage',
      name: 'body',
      geometry: { margin },
      head: '<header>רשומה <span data-slot-value="record.index"></span> מתוך <span data-slot-value="record.count"></span></header>',
      foot: '<footer>עמוד <span data-slot-value="printedPage.number"></span> מתוך <span data-slot-value="printedPage.total"></span>; מסמך <span data-slot-value="printedPage.documentNumber"></span> מתוך <span data-slot-value="printedPage.documentTotal"></span></footer>',
    },
  ],
  parentRules: [{ parent: 'body' }],
  templates: [
    {
      type: 'template',
      name: 'hebrew-row',
      slots: [slot('title', 'כותרת'), slot('body', 'תוכן')],
      html: '<style>body{font:18px sans-serif}p{line-height:1.5}</style><h1 data-slot-value="title"></h1><p data-slot-value="body"></p>',
    },
  ],
  children: [350, 150, 650].map((words, offset) => ({
    type: 'record' as const,
    id: `hebrew-record-${offset + 1}`,
    template: 'hebrew-row',
    values: { title: `רשומה ${offset + 1}`, body: hebrewWords(words) },
  })),
}
