import type { Slide } from '@segnavia/format'
import type { SegnaviaPlayer } from './player.ts'
import { PrintMomentSaveQueue } from './print-moment-save.ts'
import type { RailSlideSettingsItem, SegnaviaRail } from './rail.ts'
import { type SlideSetting, slideSettings } from './slide-settings.ts'

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
  view: 'list' | 'panel'
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
    this.rail.setSlideSettings([], null)
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
    const items: RailSlideSettingsItem[] = []
    for (const slide of deck?.slides ?? []) {
      const info = this.metadata.get(slide.id) ?? { animated: false, lengthMs: null }
      const settings = this.settingsFor(slide, info)
      if (settings.length === 0) continue
      const value = this.queue.state(slide.id).value
      const printFrame = settings.find((setting) => setting.id === 'print-frame')
      items.push({
        slideId: slide.id,
        label: this.player.labels.slideSettings,
        ...(value === null || !printFrame ? {} : { markLabel: this.player.labels.printFrameMark(printFrame.valueLabel(this.withPrintMoment(slide, value))) }),
      })
    }
    this.rail.setSlideSettings(items, this.openMenu)
  }

  private openMenu = (slideId: string, anchor: HTMLButtonElement) => {
    if (this.open?.slideId === slideId) return this.close(false)
    this.close(true)
    const item = this.rail.itemForSlide(slideId)
    if (!item) return
    anchor.setAttribute('aria-expanded', 'true')
    this.open = { slideId, anchor, initial: this.queue.state(slideId).value, view: 'list' }
    this.showList()
    setTimeout(() => window.addEventListener('pointerdown', this.outside), 0)
  }

  private showList(focusId?: string) {
    const open = this.open
    if (!open) return
    const item = this.rail.itemForSlide(open.slideId)
    const slide = this.slide(open.slideId)
    if (!item || !slide) return
    if (open.view === 'panel') this.player.releaseAuthoringFrame(open.slideId)
    item.querySelector('.slide-settings-panel')?.remove()
    const panel = document.createElement('div')
    panel.className = 'slide-settings-list'
    panel.popover = 'manual'
    panel.setAttribute('role', 'menu')
    panel.setAttribute('aria-label', this.player.labels.slideSettings)
    const info = this.metadata.get(open.slideId) ?? { animated: false, lengthMs: null }
    const settings = this.settingsFor(slide, info)
    for (const setting of settings) {
      const row = document.createElement('button')
      row.type = 'button'
      row.setAttribute('role', 'menuitem')
      row.dataset.setting = setting.id
      const value = setting.valueLabel(this.withPrintMoment(slide, this.queue.state(open.slideId).value))
      row.textContent = `${setting.label} · ${value}`
      row.addEventListener('click', () => void setting.panel({ slide, info }))
      panel.append(row)
    }
    panel.addEventListener('keydown', this.onKey)
    item.append(panel)
    panel.showPopover()
    this.position(panel, item)
    open.view = 'list'
    ;(panel.querySelector<HTMLButtonElement>(`[data-setting="${focusId ?? ''}"]`) ?? panel.querySelector<HTMLButtonElement>('button'))?.focus()
  }

  private openPrintFrame = async ({ slide, info }: { slide: Slide; info: AnimationMetadata }) => {
    const slideId = slide.id
    const deck = this.player.controller.state.deck
    const index = deck?.slides.findIndex((slide) => slide.id === slideId) ?? -1
    if (index < 0) return
    if (this.player.controller.state.index !== index) await this.player.controller.go(index)
    if (this.open?.slideId !== slideId) return
    this.rail.itemForSlide(slideId)?.querySelector('.slide-settings-list')?.remove()
    const item = this.rail.itemForSlide(slideId)
    if (!item) return
    const bounds = printFrameBounds(info.lengthMs)
    const saved = this.queue.state(slideId).value
    const value = Math.min(bounds.max, Math.max(bounds.min, saved ?? 0))
    const panel = document.createElement('div')
    panel.className = 'slide-settings-panel print-frame-panel'
    panel.popover = 'manual'
    panel.innerHTML =
      '<header><button type="button" data-back></button><div><h2></h2><p></p></div></header><output></output><input type="range"><div class="print-frame-actions"><button type="button" data-reset></button><button type="button" data-done></button></div>'
    const setting = slideSettings(this.player.labels, this.openPrintFrame)[0]
    const heading = panel.querySelector('h2') as HTMLHeadingElement
    heading.textContent = setting?.label ?? ''
    const description = panel.querySelector('p') as HTMLParagraphElement
    description.textContent = setting?.description ?? ''
    const back = panel.querySelector('[data-back]') as HTMLButtonElement
    back.textContent = this.player.labels.back
    back.addEventListener('click', () => this.showList('print-frame'))
    const slider = panel.querySelector('input') as HTMLInputElement
    slider.min = String(bounds.min)
    slider.max = String(bounds.max)
    slider.step = String(bounds.step)
    slider.value = String(value)
    const show = () => {
      const current = Number(slider.value)
      const output = panel.querySelector('output') as HTMLOutputElement
      output.textContent = this.player.labels.printFrameValue(seconds(current), seconds(bounds.max))
      this.player.freezeAuthoringFrame(slideId, current)
    }
    slider.addEventListener('input', () => {
      this.queue.editDraft(slideId, Math.round(Number(slider.value)))
      show()
    })
    slider.addEventListener('keydown', (event) => {
      const direction = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0
      if (!direction) return
      event.preventDefault()
      const amount = event.shiftKey ? 1000 : 100
      slider.value = String(Math.min(bounds.max, Math.max(bounds.min, Number(slider.value) + direction * amount)))
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
    panel.showPopover()
    this.position(panel, item)
    this.open.view = 'panel'
    show()
    slider.focus()
  }

  private position(panel: HTMLElement, item: HTMLElement) {
    const gap = 8
    const margin = 12
    const anchor = item.getBoundingClientRect()
    const box = panel.getBoundingClientRect()
    const horizontal = getComputedStyle(item.parentElement as HTMLElement).flexDirection === 'row'
    let left: number
    let top: number
    if (horizontal) {
      const above = anchor.top - box.height - gap
      top = above >= margin ? above : anchor.bottom + gap
      left = getComputedStyle(this.rail).direction === 'rtl' ? anchor.right - box.width : anchor.left
    } else {
      const rail = this.rail.getBoundingClientRect()
      const stage = this.player.shadowRoot?.querySelector('segnavia-stage')?.getBoundingClientRect()
      const stageIsAfter = stage ? stage.left >= rail.right : getComputedStyle(this.rail).direction === 'ltr'
      left = stageIsAfter ? anchor.right + gap : anchor.left - box.width - gap
      top = anchor.top
    }
    panel.style.left = `${Math.max(margin, Math.min(left, innerWidth - box.width - margin))}px`
    panel.style.top = `${Math.max(margin, Math.min(top, innerHeight - box.height - margin))}px`
  }

  private onKey = (event: KeyboardEvent) => {
    event.stopPropagation()
    if (event.key === 'Escape') {
      event.preventDefault()
      this.close(true)
      return
    }
    const list = (event.target as Element).closest('.slide-settings-list')
    if (!list || !['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return
    const rows = [...list.querySelectorAll<HTMLButtonElement>('button')]
    const current = rows.indexOf(event.target as HTMLButtonElement)
    if (current < 0 || rows.length === 0) return
    event.preventDefault()
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? rows.length - 1
          : (current + (event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1) + rows.length) % rows.length
    rows[next]?.focus()
  }

  private outside = (event: PointerEvent) => {
    const item = this.open && this.rail.itemForSlide(this.open.slideId)
    if (item && event.composedPath().includes(item)) return
    this.close(true)
  }

  private close(save: boolean) {
    const open = this.open
    if (!open) return
    this.open = null
    window.removeEventListener('pointerdown', this.outside)
    this.rail.itemForSlide(open.slideId)?.querySelector('.slide-settings-list,.slide-settings-panel')?.remove()
    open.anchor.setAttribute('aria-expanded', 'false')
    if (open.view === 'panel') this.player.releaseAuthoringFrame(open.slideId)
    if (save && this.queue.state(open.slideId).value !== open.initial) void this.queue.flush(open.slideId)
    open.anchor.focus()
  }

  private settingsFor(slide: Slide, info: AnimationMetadata): readonly SlideSetting[] {
    return slideSettings(this.player.labels, this.openPrintFrame).filter((setting) => setting.appliesTo(slide, info))
  }

  private slide(slideId: string): Slide | null {
    return this.player.controller.state.deck?.slides.find((slide) => slide.id === slideId) ?? null
  }

  private withPrintMoment(slide: Slide, value: number | null): Slide {
    if (value !== null) return { ...slide, printAtMs: value }
    const { printAtMs: _printAtMs, ...withoutPrintMoment } = slide
    return withoutPrintMoment
  }
}

function seconds(milliseconds: number): string {
  return (milliseconds / 1000).toFixed(1)
}
