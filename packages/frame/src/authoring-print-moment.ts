import type { SegnaviaPlayer } from './player.ts'
import { PrintMomentSaveQueue } from './print-moment-save.ts'
import type { RailPrintFrameItem, SegnaviaRail } from './rail.ts'

export interface SavePrintMomentInput {
  slideId: string
  printAtMs: number | null
}

export type SavePrintMoment = (input: SavePrintMomentInput) => Promise<void>

interface AnimationMetadata {
  animated: boolean
  lengthMs: number | null
}

interface OpenPanel {
  slideId: string
  anchor: HTMLButtonElement
  initial: number | null
  popover: boolean
}

export function printFrameBounds(lengthMs: number | null): { min: number; max: number; step: number } {
  return { min: 0, max: lengthMs ?? 10_000, step: 1 }
}

export class AuthoringPrintMoment {
  readonly queue: PrintMomentSaveQueue
  private rail: SegnaviaRail
  private metadata = new Map<string, AnimationMetadata>()
  private renderedDeck: unknown = null
  private open: OpenPanel | null = null

  constructor(
    private player: SegnaviaPlayer,
    save: SavePrintMoment,
    dirtyChanged: () => void,
    failed: (slideId: string, error: unknown) => void,
  ) {
    this.rail = player.authoringRail()
    this.queue = new PrintMomentSaveQueue(save, dirtyChanged, this.render, failed)
    window.addEventListener('message', this.onMessage)
    this.player.controller.addEventListener('change', this.render)
    this.player.addEventListener('segnavia-labels', this.render)
    this.render()
    this.rail.requestAnimationReports()
  }

  setSave(save: SavePrintMoment) {
    this.queue.setSave(save)
  }

  dispose() {
    this.close(false)
    window.removeEventListener('message', this.onMessage)
    window.removeEventListener('pointerdown', this.outside)
    this.player.controller.removeEventListener('change', this.render)
    this.player.removeEventListener('segnavia-labels', this.render)
    this.rail.setPrintFrames([], null)
  }

  private onMessage = (event: MessageEvent) => {
    const report = this.rail.animationMessage(event)
    if (!report?.slideId) return
    this.metadata.set(report.slideId, { animated: report.animated, lengthMs: report.lengthMs })
    this.render()
  }

  private render = () => {
    const deck = this.player.controller.state.deck
    if (deck !== this.renderedDeck) {
      this.renderedDeck = deck
      for (const slide of deck?.slides ?? []) this.queue.seed(slide.id, slide.printAtMs ?? null)
    }
    const items: RailPrintFrameItem[] = []
    for (const slide of deck?.slides ?? []) {
      if (slide.content.kind !== 'html' || !this.metadata.get(slide.id)?.animated) continue
      const value = this.queue.state(slide.id).value
      items.push({
        slideId: slide.id,
        label: this.player.labels.slideOptions,
        ...(value === null ? {} : { markLabel: this.player.labels.printsAt(seconds(value)) }),
      })
    }
    this.rail.setPrintFrames(items, this.openMenu)
  }

  private openMenu = (slideId: string, anchor: HTMLButtonElement) => {
    if (this.open?.slideId === slideId) return this.close(false)
    this.close(true)
    const item = this.rail.itemForSlide(slideId)
    if (!item) return
    anchor.setAttribute('aria-expanded', 'true')
    const panel = document.createElement('div')
    panel.className = 'print-menu-panel'
    panel.innerHTML = '<button type="button"></button>'
    const choose = panel.querySelector('button') as HTMLButtonElement
    choose.textContent = this.player.labels.printFrame
    choose.addEventListener('click', () => void this.openPopover(slideId, panel))
    panel.addEventListener('keydown', this.onKey)
    item.append(panel)
    this.open = { slideId, anchor, initial: this.queue.state(slideId).value, popover: false }
    choose.focus()
    setTimeout(() => window.addEventListener('pointerdown', this.outside), 0)
  }

  private async openPopover(slideId: string, menu: HTMLElement) {
    const deck = this.player.controller.state.deck
    const index = deck?.slides.findIndex((slide) => slide.id === slideId) ?? -1
    if (index < 0) return
    if (this.player.controller.state.index !== index) await this.player.controller.go(index)
    if (this.open?.slideId !== slideId) return
    menu.remove()
    const item = this.rail.itemForSlide(slideId)
    if (!item) return
    const bounds = printFrameBounds(this.metadata.get(slideId)?.lengthMs ?? null)
    const saved = this.queue.state(slideId).value
    const value = Math.min(bounds.max, Math.max(bounds.min, saved ?? 0))
    const panel = document.createElement('div')
    panel.className = 'print-frame-panel'
    panel.innerHTML =
      '<output></output><input type="range"><div class="print-frame-actions"><button type="button" data-reset></button><button type="button" data-done></button></div>'
    const slider = panel.querySelector('input') as HTMLInputElement
    slider.min = String(bounds.min)
    slider.max = String(bounds.max)
    slider.step = String(bounds.step)
    slider.value = String(value)
    const show = () => {
      const current = Number(slider.value)
      const output = panel.querySelector('output') as HTMLOutputElement
      output.textContent = this.player.labels.printFrameValue(seconds(current), seconds(bounds.max))
      this.player.freezeAuthoringFrame(current)
    }
    slider.addEventListener('input', () => {
      this.queue.editDraft(slideId, Math.round(Number(slider.value)))
      show()
    })
    const reset = panel.querySelector('[data-reset]') as HTMLButtonElement
    reset.textContent = this.player.labels.resetPrintMoment
    reset.addEventListener('click', () => {
      slider.value = '0'
      this.queue.editDraft(slideId, null)
      show()
    })
    const done = panel.querySelector('[data-done]') as HTMLButtonElement
    done.textContent = this.player.labels.done
    done.addEventListener('click', () => this.close(true))
    panel.addEventListener('keydown', this.onKey)
    item.append(panel)
    this.open.popover = true
    show()
    slider.focus()
  }

  private onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    this.close(true)
  }

  private outside = (event: PointerEvent) => {
    const item = this.open && this.rail.itemForSlide(this.open.slideId)
    if (item?.contains(event.target as Node)) return
    this.close(true)
  }

  private close(save: boolean) {
    const open = this.open
    if (!open) return
    this.open = null
    window.removeEventListener('pointerdown', this.outside)
    this.rail.itemForSlide(open.slideId)?.querySelector('.print-menu-panel,.print-frame-panel')?.remove()
    open.anchor.setAttribute('aria-expanded', 'false')
    if (open.popover) this.player.releaseAuthoringFrame()
    if (save && this.queue.state(open.slideId).value !== open.initial) void this.queue.flush(open.slideId)
    open.anchor.focus()
  }
}

function seconds(milliseconds: number): string {
  return (milliseconds / 1000).toFixed(1)
}
