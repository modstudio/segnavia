export const DOCUMENT_PROFILES = {
  book: {
    children: ['division', 'part', 'section', 'flow', 'page', 'placed', 'contents', 'record'],
    definitions: ['parentPages', 'templates', 'noteSeries', 'variables', 'conditions'],
    settingsDir: ['ltr', 'rtl', 'auto'],
    settings: ['scripts', 'dir', 'lang'],
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
      'limits',
    ],
  },
  printed: {
    children: ['section', 'page', 'flow', 'placed', 'record'],
    definitions: ['parentPages', 'templates', 'variables', 'conditions'],
    settingsDir: ['ltr', 'rtl', 'auto'],
    settings: ['scripts', 'dir', 'lang'],
    fields: ['metadata', 'title', 'brand', 'settings', 'style', 'data', 'size', 'print', 'numbering', 'fragmentation', 'rules', 'limits'],
  },
  deck: {
    children: ['slide'],
    definitions: ['conditions'],
    settingsDir: ['ltr', 'rtl', 'auto'],
    settings: ['scripts', 'dir', 'lang'],
    fields: ['metadata', 'title', 'brand', 'settings', 'style', 'data', 'size', 'layout', 'fit', 'frame', 'transition', 'playback', 'captions', 'limits'],
  },
  page: {
    children: ['page'],
    definitions: ['conditions'],
    settingsDir: ['ltr', 'rtl', 'auto'],
    settings: ['scripts', 'dir', 'lang'],
    fields: ['metadata', 'title', 'brand', 'settings', 'style', 'data', 'size', 'print', 'limits'],
  },
  board: {
    children: ['item', 'label', 'boardSection'],
    definitions: ['conditions'],
    settingsDir: ['ltr', 'rtl'],
    settings: ['dir'],
    fields: ['metadata', 'title', 'brand', 'settings', 'limits'],
  },
} as const

export type DocumentKind = keyof typeof DOCUMENT_PROFILES
export type DocumentNodeType = (typeof DOCUMENT_PROFILES)[DocumentKind]['children'][number]
export type DocumentDefinition = (typeof DOCUMENT_PROFILES)[DocumentKind]['definitions'][number]
export type DocumentField = (typeof DOCUMENT_PROFILES)[DocumentKind]['fields'][number]

export function profileRefusal(value: string, kind: DocumentKind, allowed: readonly string[], subject = 'node'): string {
  return `${subject} ${value} is not allowed in a ${kind} document; use one of ${allowed.join(', ')} to clear this refusal`
}
