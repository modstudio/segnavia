import { attachAuthoring } from '@segnavia/frame/authoring'

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
  releaseMove: () => {},
  rejectNotes: false,
  deferNotes: false,
  releaseNotes: () => {},
  dirty: [] as boolean[],
  errors: 0,
}
const authoring = attachAuthoring(player as never, {
  async moveSlide(input) {
    facts.moves.push(input)
    if (facts.deferMove) await new Promise<void>((resolve) => (facts.releaseMove = resolve))
    if (facts.rejectMove) throw new Error('Move refused')
  },
  async saveNotes(input) {
    facts.saves.push(input)
    if (facts.deferNotes) await new Promise<void>((resolve) => (facts.releaseNotes = resolve))
    if (facts.rejectNotes) throw new Error('Notes refused')
  },
})
authoring.addEventListener('dirty-change', (event) => facts.dirty.push((event as CustomEvent<{ dirty: boolean }>).detail.dirty))
authoring.addEventListener('authoring-error', () => facts.errors++)
Object.assign(window, { authoring, authoringFacts: facts })
