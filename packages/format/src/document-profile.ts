export const DOCUMENT_PROFILES = {
  book: {
    children: ['division', 'part', 'section', 'flow', 'page', 'placed', 'contents', 'record'],
    definitions: ['parentPages', 'templates', 'noteSeries', 'variables', 'conditions'],
    fields: [
      'metadata',
      'title',
      'brand',
      'settings',
      'style',
      'data',
      'mode',
      'page',
      'numbering',
      'footnotes',
      'endnotes',
      'rectoOpenings',
      'orphans',
      'widows',
      'fragmentation',
      'runningHead',
    ],
  },
  printed: {
    children: ['section', 'page', 'flow', 'placed', 'record'],
    definitions: ['parentPages', 'templates', 'variables', 'conditions'],
    fields: ['metadata', 'title', 'brand', 'settings', 'style', 'data', 'size', 'print', 'numbering', 'fragmentation', 'rules'],
  },
  deck: {
    children: ['slide'],
    definitions: ['conditions'],
    fields: ['metadata', 'title', 'brand', 'settings', 'style', 'data', 'size', 'layout', 'fit', 'frame', 'transition', 'playback', 'captions'],
  },
  page: {
    children: ['page'],
    definitions: ['conditions'],
    fields: ['metadata', 'title', 'brand', 'settings', 'style', 'data', 'size', 'print'],
  },
  board: {
    children: ['item', 'label', 'boardSection'],
    definitions: ['conditions'],
    fields: ['metadata', 'title', 'brand', 'settings'],
  },
} as const

export type DocumentKind = keyof typeof DOCUMENT_PROFILES
export type DocumentNodeType = (typeof DOCUMENT_PROFILES)[DocumentKind]['children'][number]
export type DocumentDefinition = (typeof DOCUMENT_PROFILES)[DocumentKind]['definitions'][number]
export type DocumentField = (typeof DOCUMENT_PROFILES)[DocumentKind]['fields'][number]

export function profileRefusal(value: string, kind: DocumentKind, allowed: readonly string[], subject = 'node'): string {
  return `${subject} ${value} is not allowed in a ${kind} document; use one of ${allowed.join(', ')} to clear this refusal`
}
