import type { SegnaviaPlayer } from './player.ts'
import { PrintMomentSaveQueue } from './print-moment-save.ts'

const PRINT_MOMENT_CSS = `<style>
[data-authoring-print-moment]{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px;border-block-start:1px solid var(--_line);background:var(--_surface);font:13px/1.4 system-ui;color:var(--_ink)}
[data-authoring-print-moment] output{font-weight:600;margin-inline-end:auto}
[data-authoring-print-moment] button{padding:6px 9px;border:1px solid var(--_line);border-radius:8px;background:var(--_bg);color:var(--_ink);font:inherit;cursor:pointer}
[data-authoring-print-moment] button:disabled{cursor:default;opacity:.5}
</style>`

export interface SavePrintMomentInput {
  slideId: string
  printAtMs: number | null
}

export type SavePrintMoment = (input: SavePrintMomentInput) => Promise<void>

export class AuthoringPrintMoment {
  readonly queue: PrintMomentSaveQueue
  private root: HTMLElement
  private renderedDeck: unknown = null

  constructor(
    private player: SegnaviaPlayer,
    save: SavePrintMoment,
    dirtyChanged: () => void,
    failed: (slideId: string, error: unknown) => void,
  ) {
    this.root = document.createElement('div')
    this.root.dataset.authoringPrintMoment = ''
    this.root.innerHTML = `${PRINT_MOMENT_CSS}<output></output><button type="button" data-use-frame></button><button type="button" data-reset></button>`
    this.player.authoringMount().prepend(this.root)
    this.queue = new PrintMomentSaveQueue(save, dirtyChanged, this.render, failed)
    this.root.querySelector('[data-use-frame]')?.addEventListener('click', () => this.useCurrentFrame())
    this.root.querySelector('[data-reset]')?.addEventListener('click', () => this.reset())
    this.player.controller.addEventListener('change', this.render)
    this.player.addEventListener('segnavia-labels', this.render)
    this.render()
  }

  setSave(save: SavePrintMoment) {
    this.queue.setSave(save)
  }

  dispose() {
    this.player.controller.removeEventListener('change', this.render)
    this.player.removeEventListener('segnavia-labels', this.render)
    this.root.remove()
  }

  private render = () => {
    const { deck, slide, playing } = this.player.controller.state
    if (deck !== this.renderedDeck) {
      this.renderedDeck = deck
      for (const deckSlide of deck?.slides ?? []) this.queue.seed(deckSlide.id, deckSlide.printAtMs ?? null)
    }
    const html = slide?.content.kind === 'html'
    this.root.hidden = !html
    if (!slide || !html) return
    const value = this.queue.state(slide.id).value
    const output = this.root.querySelector('output')
    const use = this.root.querySelector('[data-use-frame]') as HTMLButtonElement
    const reset = this.root.querySelector('[data-reset]') as HTMLButtonElement
    if (output) output.textContent = value === null ? this.player.labels.printsAtStart : this.player.labels.printsAt(seconds(value))
    use.textContent = this.player.labels.useThisFrame
    use.disabled = playing
    reset.textContent = this.player.labels.resetPrintMoment
    reset.disabled = value === null
  }

  private useCurrentFrame() {
    const { slide, playing, slideElapsedMs } = this.player.controller.state
    if (slide?.content.kind !== 'html' || playing) return
    this.queue.edit(slide.id, Math.round(slideElapsedMs))
  }

  private reset() {
    const slide = this.player.controller.state.slide
    if (slide?.content.kind === 'html') this.queue.edit(slide.id, null)
  }
}

function seconds(milliseconds: number): string {
  return String(milliseconds / 1000)
}
