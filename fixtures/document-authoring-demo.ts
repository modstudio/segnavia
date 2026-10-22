import type { SegnaviaDocument } from '@segnavia/frame'
import { attachDocumentAuthoring, type DocumentAuthoringHandlers } from '@segnavia/frame/document-authoring'

const documentElement = document.querySelector('#brochure') as SegnaviaDocument
const facts = { moves: [] as unknown[], errors: [] as unknown[], itemSettingsOpen: [] as unknown[], rejectMove: false, reattachItemSettings: () => {} }
const handlers: DocumentAuthoringHandlers = {
  movePage: async (input) => {
    facts.moves.push(input)
    if (facts.rejectMove) throw new Error('Move refused')
  },
}
let authoring = attachDocumentAuthoring(documentElement, handlers)
const listen = () => authoring.addEventListener('authoring-error', (event) => facts.errors.push((event as CustomEvent).detail))
listen()
documentElement.addEventListener('segnavia-item-settings-open', (event) => facts.itemSettingsOpen.push((event as CustomEvent).detail))
facts.reattachItemSettings = () => {
  authoring.detach()
  authoring = attachDocumentAuthoring(documentElement, handlers, { itemSettings: true })
  listen()
  Object.assign(window, { documentAuthoring: authoring })
}
Object.assign(window, { documentAuthoring: authoring, documentAuthoringFacts: facts })
