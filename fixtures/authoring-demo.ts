import { attachAuthoring, slideSettingsSection } from '@segnavia/frame/authoring'
import type { SegnaviaItemSettings } from '@segnavia/frame/item-settings'
import '@segnavia/frame/item-settings'

const player = document.querySelector('segnavia-player') as HTMLElement & { controller: EventTarget & { state: { deck: unknown } } }
await customElements.whenDefined('segnavia-player')
await new Promise<void>((resolve) => {
  if (player.controller.state.deck) resolve()
  else player.controller.addEventListener('change', () => player.controller.state.deck && resolve(), { once: true })
})
const facts = {
  moves: [] as unknown[],
  saves: [] as unknown[],
  rejectMove: false,
  deferMove: false,
  movePending: false,
  releaseMove: () => {},
  rejectNotes: false,
  deferNotes: false,
  releaseNotes: () => {},
  printSaves: [] as unknown[],
  deferPrintMoment: false,
  releasePrintMoment: () => {},
  dirty: [] as boolean[],
  errors: 0,
  itemSettingsOpen: [] as unknown[],
}
const authoring = attachAuthoring(
  player as never,
  {
    async moveSlide(input) {
      facts.moves.push(input)
      if (facts.deferMove) {
        facts.movePending = true
        await new Promise<void>((resolve) => (facts.releaseMove = resolve))
        facts.movePending = false
      }
      if (facts.rejectMove) throw new Error('Move refused')
    },
    async saveNotes(input) {
      facts.saves.push(input)
      if (facts.deferNotes) await new Promise<void>((resolve) => (facts.releaseNotes = resolve))
      if (facts.rejectNotes) throw new Error('Notes refused')
    },
    async savePrintMoment(input) {
      facts.printSaves.push(input)
      if (facts.deferPrintMoment) await new Promise<void>((resolve) => (facts.releasePrintMoment = resolve))
    },
  },
  { itemSettings: true },
)
const settings = document.querySelector<SegnaviaItemSettings>('#item-settings')
if (settings) {
  settings.addSection(slideSettingsSection(authoring))
  player.addEventListener('segnavia-item-settings-open', (event) => {
    facts.itemSettingsOpen.push((event as CustomEvent).detail)
    settings.hidden = false
  })
}
authoring.addEventListener('dirty-change', (event) => facts.dirty.push((event as CustomEvent<{ dirty: boolean }>).detail.dirty))
authoring.addEventListener('authoring-error', () => facts.errors++)
Object.assign(window, { authoring, authoringFacts: facts })
