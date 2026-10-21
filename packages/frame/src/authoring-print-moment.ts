import type { Slide } from '@segnavia/format'
import type { SegnaviaPlayer } from './player.ts'
import { PrintMomentSaveQueue } from './print-moment-save.ts'
import type { SegnaviaRail } from './rail.ts'
import { type SlideSettingInfo, type SlideSettingPanelContext, slideSettings } from './slide-settings.ts'
import { SlideSettingsController } from './slide-settings-controller.ts'

export interface SavePrintMomentInput {
  slideId: string
  printAtMs: number | null
}

export type SavePrintMoment = (input: SavePrintMomentInput) => Promise<void>

interface RankedAnimationMetadata extends SlideSettingInfo {
  source: 'thumbnail' | 'stage'
}

export function printFrameBounds(lengthMs: number | null): { min: number; max: number; step: number } {
  return { min: 0, max: lengthMs ?? 10_000, step: 1 }
}

export class AuthoringPrintMoment {
  readonly queue: PrintMomentSaveQueue
  private rail: SegnaviaRail
  private metadata = new Map<string, RankedAnimationMetadata>()
  private renderedDeck: unknown = null
  private settings: SlideSettingsController

  constructor(
    private player: SegnaviaPlayer,
    save: SavePrintMoment,
    dirtyChanged: () => void,
    failed: (slideId: string, error: unknown) => void,
  ) {
    this.rail = player.authoringRail()
    this.queue = new PrintMomentSaveQueue(save, dirtyChanged, () => this.settings?.refresh(), failed)
    window.addEventListener('message', this.onMessage)
    this.player.controller.addEventListener('change', this.render)
    this.settings = new SlideSettingsController(player, () => slideSettings(this.player.labels, this.openPrintFrame), this.info, this.withDraft)
    this.render()
  }

  setSave(save: SavePrintMoment) {
    return this.queue.setSave(save)
  }

  beforeNavigate() {
    this.settings.beforeNavigate()
  }

  dispose() {
    this.settings.dispose()
    window.removeEventListener('message', this.onMessage)
    this.player.controller.removeEventListener('change', this.render)
  }

  private info = (slideId: string): SlideSettingInfo => this.metadata.get(slideId) ?? { animated: false, lengthMs: null }

  private onMessage = (event: MessageEvent) => {
    const stage = this.player.authoringAnimationMessage(event)
    const report = stage ?? this.rail.animationMessage(event)
    if (!report?.slideId) return
    const source = stage ? 'stage' : 'thumbnail'
    if (source === 'thumbnail' && this.metadata.get(report.slideId)?.source === 'stage') return
    this.metadata.set(report.slideId, { animated: report.animated, lengthMs: report.lengthMs, source })
    this.settings.refresh()
  }

  private render = () => {
    const deck = this.player.controller.state.deck
    if (deck !== this.renderedDeck) {
      this.renderedDeck = deck
      for (const slide of deck?.slides ?? []) this.queue.seed(slide.id, slide.printAtMs ?? null)
    }
    this.settings.refresh()
    this.rail.requestAnimationReports()
    this.player.requestAuthoringAnimationReport()
  }

  private openPrintFrame = async (context: SlideSettingPanelContext) => {
    const { slide, info } = context
    if (!(await context.navigateToSlide())) return
    const bounds = printFrameBounds(info.lengthMs)
    const saved = this.queue.state(slide.id).value
    const initial = saved
    const value = Math.min(bounds.max, Math.max(bounds.min, saved ?? 0))
    const panel = document.createElement('div')
    panel.className = 'print-frame-panel'
    panel.innerHTML =
      '<header><button type="button" data-back></button><div><h2></h2><p></p></div></header><output></output><input type="range"><div class="print-frame-actions"><button type="button" data-reset></button><button type="button" data-done></button></div>'
    const heading = panel.querySelector('h2') as HTMLHeadingElement
    heading.textContent = this.player.labels.printFrame
    const description = panel.querySelector('p') as HTMLParagraphElement
    description.textContent = this.player.labels.printFrameDescription
    const back = panel.querySelector('[data-back]') as HTMLButtonElement
    back.textContent = this.player.labels.back
    back.addEventListener('click', context.back)
    const slider = panel.querySelector('input') as HTMLInputElement
    slider.min = String(bounds.min)
    slider.max = String(bounds.max)
    slider.step = String(bounds.step)
    slider.value = String(value)
    const show = () => {
      const current = Number(slider.value)
      ;(panel.querySelector('output') as HTMLOutputElement).textContent = this.player.labels.printFrameValue(seconds(current), seconds(bounds.max))
      this.player.freezeAuthoringFrame(slide.id, current)
    }
    slider.addEventListener('input', () => {
      this.queue.editDraft(slide.id, Math.round(Number(slider.value)))
      show()
    })
    slider.addEventListener('keydown', (event) => {
      const direction = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0
      if (!direction) return
      event.preventDefault()
      slider.value = String(Math.min(bounds.max, Math.max(bounds.min, Number(slider.value) + direction * (event.shiftKey ? 1000 : 100))))
      this.queue.editDraft(slide.id, Math.round(Number(slider.value)))
      show()
    })
    const reset = panel.querySelector('[data-reset]') as HTMLButtonElement
    reset.textContent = this.player.labels.resetPrintMoment
    reset.addEventListener('click', () => {
      slider.value = '0'
      this.queue.editDraft(slide.id, null)
      show()
    })
    const done = panel.querySelector('[data-done]') as HTMLButtonElement
    done.textContent = this.player.labels.done
    done.addEventListener('click', context.close)
    context.mount(panel, (save) => {
      this.player.releaseAuthoringFrame(slide.id)
      if (save && this.queue.state(slide.id).value !== initial) void this.queue.flush(slide.id)
    })
    show()
    slider.focus()
  }

  private withDraft = (slide: Slide): Slide => {
    const value = this.queue.draft(slide.id) ?? null
    if (value !== null) return { ...slide, printAtMs: value }
    const { printAtMs: _printAtMs, ...withoutPrintMoment } = slide
    return withoutPrintMoment
  }
}

function seconds(milliseconds: number): string {
  return (milliseconds / 1000).toFixed(1)
}
