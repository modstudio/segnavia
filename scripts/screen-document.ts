import type { DocumentInput, PageBody } from '@segnavia/format'

type ScreenPageFields = Omit<DocumentInput, 'type' | 'kind' | 'children'>
type DeckFields = Omit<DocumentInput, 'type' | 'kind' | 'children'>

export function screenPage(body: PageBody, fields: ScreenPageFields = {}): DocumentInput {
  return { type: 'document', kind: 'page', ...fields, children: [{ type: 'page', body }] }
}

export function screenDeck(children: DocumentInput['children'], fields: DeckFields = {}): DocumentInput {
  return { type: 'document', kind: 'deck', ...fields, children }
}
