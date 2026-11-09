import type { DocumentInput } from '@segnavia/format'

const margin = { blockStart: 18, blockEnd: 18, inlineStart: 18, inlineEnd: 18 }
const slot = (key: string, label: string) => ({ key, label, type: 'text' as const })
const variableDefinitions = [
  { type: 'variable' as const, name: 'record-index', kind: 'record' as const, value: 'index' as const },
  { type: 'variable' as const, name: 'record-count', kind: 'record' as const, value: 'count' as const },
  { type: 'variable' as const, name: 'record-pages', kind: 'pages' as const, of: 'record' as const },
]
const headTemplates = variableDefinitions.map(({ name }) => ({ type: 'headTemplate' as const, name, parts: [{ variable: name }] }))
const placed = (name: string) => `<span data-motif="segnavia:head-template" data-motif-name="${name}"></span>`

export const recordsTableDocument: DocumentInput = {
  type: 'document',
  kind: 'printed',
  settings: { lang: 'en' },
  print: { paper: 'letter' },
  variables: variableDefinitions,
  headTemplates,
  parentPages: [
    {
      type: 'parentPage',
      name: 'body',
      geometry: { margin },
      head: `<header>Record ${placed('record-index')} of ${placed('record-count')}</header>`,
      foot: `<footer>Page ${placed('segnavia:folio')} of ${placed('record-pages')}</footer>`,
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
  variables: [
    { type: 'variable', name: 'record-index', kind: 'record', value: 'index', system: 'arabic' },
    { type: 'variable', name: 'record-count', kind: 'record', value: 'count', system: 'arabic' },
    { type: 'variable', name: 'record-pages', kind: 'pages', of: 'record' },
  ],
  headTemplates,
  parentPages: [
    {
      type: 'parentPage',
      name: 'body',
      geometry: { margin },
      head: `<header>רשומה ${placed('record-index')} מתוך ${placed('record-count')}</header>`,
      foot: `<footer>עמוד ${placed('segnavia:folio')} מתוך ${placed('record-pages')}; מסמך ${placed('record-index')} מתוך ${placed('record-count')}</footer>`,
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
