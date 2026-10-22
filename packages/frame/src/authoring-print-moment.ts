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
  private sectionChanges = new Set<() => void>()
  private sectionBeforeNavigate = new Set<() => void>()

  constructor(
    private player: SegnaviaPlayer,
    save: SavePrintMoment,
    dirtyChanged: () => void,
    failed: (slideId: string, error: unknown) => void,
  ) {
    this.rail = player.authoringRail()
    this.queue = new PrintMomentSaveQueue(save, dirtyChanged, this.changed, failed)
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
    for (const close of this.sectionBeforeNavigate) close()
  }

  dispose() {
    this.settings.dispose()
    window.removeEventListener('message', this.onMessage)
    this.player.controller.removeEventListener('change', this.render)
  }

  renderSection(container: HTMLElement) {
    let panelCleanup: ((save: boolean) => void) | undefined
    let panelOpen = false
    const finalizePanel = (save: boolean) => {
      const cleanup = panelCleanup
      panelCleanup = undefined
      panelOpen = false
      cleanup?.(save)
    }
    const renderList = () => {
      finalizePanel(false)
      container.replaceChildren()
      const slide = this.player.controller.state.slide
      if (!slide) return this.renderEmpty(container)
      const settings = slideSettings(this.player.labels, this.openPrintFrame).filter((setting) => setting.appliesTo(slide, this.info(slide.id)))
      if (settings.length === 0) return this.renderEmpty(container)
      for (const setting of settings) {
        const row = document.createElement('button')
        row.type = 'button'
        row.dataset.setting = setting.id
        row.textContent = `${setting.label} · ${setting.valueLabel(this.withDraft(slide))}`
        row.addEventListener('click', () => {
          panelOpen = true
          void setting.panel({
            slide,
            info: this.info(slide.id),
            mount: (panel, cleanup) => {
              panelCleanup = cleanup
              container.replaceChildren(panel)
            },
            back: () => {
              finalizePanel(true)
              renderList()
            },
            close: () => {
              finalizePanel(true)
              renderList()
            },
            navigateToSlide: async () => this.player.controller.state.slide?.id === slide.id,
          })
        })
        container.append(row)
      }
    }
    const changed = () => {
      if (!panelOpen) renderList()
    }
    const navigated = () => {
      finalizePanel(false)
      renderList()
    }
    const labelsChanged = () => {
      finalizePanel(true)
      renderList()
    }
    const beforeNavigate = () => finalizePanel(false)
    this.sectionChanges.add(changed)
    this.sectionBeforeNavigate.add(beforeNavigate)
    this.player.controller.addEventListener('change', navigated)
    this.player.addEventListener('segnavia-labels', labelsChanged)
    const observer = new MutationObserver(() => {
      if (container.isConnected) return
      observer.disconnect()
      finalizePanel(false)
      this.sectionChanges.delete(changed)
      this.sectionBeforeNavigate.delete(beforeNavigate)
      this.player.controller.removeEventListener('change', navigated)
      this.player.removeEventListener('segnavia-labels', labelsChanged)
    })
    observer.observe(container.getRootNode(), { childList: true, subtree: true })
    renderList()
  }

  private renderEmpty(container: HTMLElement) {
    const note = document.createElement('p')
    note.dir = 'auto'
    note.textContent = this.player.labels.noSettingsForSlide
    container.append(note)
  }

  private changed = () => {
    this.refreshViews()
  }

  private refreshViews() {
    this.settings?.refresh()
    for (const refresh of this.sectionChanges) refresh()
  }

  private info = (slideId: string): SlideSettingInfo => this.metadata.get(slideId) ?? { animated: false, lengthMs: null }

  private onMessage = (event: MessageEvent) => {
    const stage = this.player.authoringAnimationMessage(event)
    const report = stage ?? this.rail.animationMessage(event)
    if (!report?.slideId) return
    this.acceptReport(report, stage ? 'stage' : 'thumbnail')
  }

  private acceptReport(report: { slideId: string; animated: boolean; lengthMs: number | null }, source: RankedAnimationMetadata['source']) {
    if (source === 'thumbnail' && this.metadata.get(report.slideId)?.source === 'stage') return
    this.metadata.set(report.slideId, { animated: report.animated, lengthMs: report.lengthMs, source })
    this.refreshViews()
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
