export const DOCUMENT_PROFILES = {
  book: {
    children: ['division', 'part', 'section', 'flow', 'page', 'placed', 'contents', 'record'],
    definitions: ['parentPages', 'templates', 'noteSeries', 'variables', 'conditions'],
  },
  printed: {
    children: ['section', 'page', 'flow', 'placed', 'record'],
    definitions: ['parentPages', 'templates', 'variables', 'conditions'],
  },
  deck: { children: ['slide'], definitions: ['conditions'] },
  page: { children: ['page'], definitions: ['conditions'] },
  board: { children: ['item', 'label', 'boardSection'], definitions: ['conditions'] },
} as const

export type DocumentKind = keyof typeof DOCUMENT_PROFILES
export type DocumentNodeType = (typeof DOCUMENT_PROFILES)[DocumentKind]['children'][number]
export type DocumentDefinition = (typeof DOCUMENT_PROFILES)[DocumentKind]['definitions'][number]

export function profileRefusal(node: string, kind: DocumentKind, allowed: readonly string[]): string {
  return `node ${node} is not allowed in a ${kind} document; use one of ${allowed.join(', ')} to clear this refusal`
}
