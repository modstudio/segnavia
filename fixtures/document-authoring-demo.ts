import type { SegnaviaDocument } from '@segnavia/frame'
import { attachDocumentAuthoring } from '@segnavia/frame/document-authoring'

const documentElement = document.querySelector('#brochure') as SegnaviaDocument
const facts = { moves: [] as unknown[], errors: [] as unknown[], rejectMove: false }
const authoring = attachDocumentAuthoring(documentElement, {
  movePage: async (input) => {
    facts.moves.push(input)
    if (facts.rejectMove) throw new Error('Move refused')
  },
})
authoring.addEventListener('authoring-error', (event) => facts.errors.push((event as CustomEvent).detail))
Object.assign(window, { documentAuthoring: authoring, documentAuthoringFacts: facts })
