import type { DocumentInput, SlotDeclarationInput } from '@segnavia/format'

export const pageDocument = (html: string, scripts: 'refuse' | 'sandboxed' = 'refuse', slots?: SlotDeclarationInput[]): DocumentInput => ({
  type: 'document',
  kind: 'page',
  settings: { scripts },
  data: { slots },
  children: [{ type: 'page', body: { html } }],
})
