import type { Slide } from '@segnavia/format'
import type { SegnaviaPlayer } from './player.ts'
import type { RailSlideSettingsItem, SegnaviaRail } from './rail.ts'
import type { SlideSetting, SlideSettingInfo } from './slide-settings.ts'

interface OpenSetting {
  slideId: string
  anchor: HTMLButtonElement
  view: 'list' | 'panel'
  settingId?: string
  cleanup?: (save: boolean) => void
}

export class SlideSettingsController {
  private rail: SegnaviaRail
  private open: OpenSetting | null = null
  private internalNavigation = false
  private lastIndex: number

  constructor(
    private player: SegnaviaPlayer,
    private registry: () => readonly SlideSetting[],
    private info: (slideId: string) => SlideSettingInfo,
    private viewSlide: (slide: Slide) => Slide,
  ) {
    this.rail = player.authoringRail()
    this.lastIndex = player.controller.state.index
    player.controller.addEventListener('change', this.changed)
    player.addEventListener('segnavia-labels', this.refresh)
  }

  refresh = () => {
    const items: RailSlideSettingsItem[] = []
    for (const slide of this.player.controller.state.deck?.slides ?? []) {
      const viewed = this.viewSlide(slide)
      const settings = this.settingsFor(slide)
      if (settings.length === 0) continue
      const markLabel = settings.map((setting) => setting.markLabel?.(viewed)).find((label) => label !== undefined)
      items.push({ slideId: slide.id, label: this.player.labels.slideSettings, ...(markLabel ? { markLabel } : {}) })
    }
    this.rail.setSlideSettings(items, this.openMenu)
  }

  beforeNavigate() {
    if (!this.internalNavigation) this.close(true)
  }

  dispose() {
    this.close(false)
    this.player.controller.removeEventListener('change', this.changed)
    this.player.removeEventListener('segnavia-labels', this.refresh)
    this.rail.setSlideSettings([], null)
  }

  private changed = () => {
    const index = this.player.controller.state.index
    if (index !== this.lastIndex && !this.internalNavigation) this.close(true)
    this.lastIndex = index
    this.refresh()
  }

  private openMenu = (slideId: string, anchor: HTMLButtonElement) => {
    if (this.open?.slideId === slideId) return this.close(false)
    this.close(true)
    if (!this.rail.itemForSlide(slideId)) return
    anchor.setAttribute('aria-expanded', 'true')
    this.open = { slideId, anchor, view: 'list' }
    this.showList()
    setTimeout(() => window.addEventListener('pointerdown', this.outside), 0)
  }

  private showList(focusId?: string) {
    const open = this.open
    if (!open) return
    const item = this.rail.itemForSlide(open.slideId)
    const slide = this.slide(open.slideId)
    if (!item || !slide) return
    open.cleanup?.(false)
    item.querySelector('.slide-settings-panel')?.remove()
    const panel = document.createElement('div')
    panel.className = 'slide-settings-list'
    panel.popover = 'manual'
    panel.setAttribute('role', 'menu')
    panel.setAttribute('aria-label', this.player.labels.slideSettings)
    for (const setting of this.settingsFor(slide)) {
      const row = document.createElement('button')
      row.type = 'button'
      row.setAttribute('role', 'menuitem')
      row.dataset.setting = setting.id
      row.textContent = `${setting.label} · ${setting.valueLabel(this.viewSlide(slide))}`
      row.addEventListener('click', () => void this.openPanel(setting, slide))
      panel.append(row)
    }
    panel.addEventListener('keydown', this.onKey)
    item.append(panel)
    panel.showPopover()
    this.position(panel, item)
    open.view = 'list'
    ;(panel.querySelector<HTMLButtonElement>(`[data-setting="${focusId ?? ''}"]`) ?? panel.querySelector<HTMLButtonElement>('button'))?.focus()
  }

  private async openPanel(setting: SlideSetting, slide: Slide) {
    const open = this.open
    if (!open || open.slideId !== slide.id) return
    if (open.settingId !== setting.id) {
      open.cleanup?.(true)
      open.cleanup = undefined
      open.settingId = setting.id
    }
    await setting.panel({
      slide,
      info: this.info(slide.id),
      mount: (panel, cleanup) => this.mountPanel(panel, cleanup),
      back: () => this.showList(setting.id),
      close: () => this.close(true),
      navigateToSlide: () => this.navigateToSlide(slide.id),
    })
  }

  private mountPanel(panel: HTMLElement, cleanup?: (save: boolean) => void) {
    const open = this.open
    if (!open) return
    const item = this.rail.itemForSlide(open.slideId)
    if (!item) return
    item.querySelector('.slide-settings-list,.slide-settings-panel')?.remove()
    panel.classList.add('slide-settings-panel')
    panel.popover = 'manual'
    panel.addEventListener('keydown', this.onKey)
    item.append(panel)
    panel.showPopover()
    this.position(panel, item)
    open.view = 'panel'
    open.cleanup ??= cleanup
  }

  private async navigateToSlide(slideId: string): Promise<boolean> {
    const index = this.player.controller.state.deck?.slides.findIndex((slide) => slide.id === slideId) ?? -1
    if (index < 0) return false
    if (this.player.controller.state.index === index) return true
    this.internalNavigation = true
    try {
      await this.player.controller.go(index)
      return this.open?.slideId === slideId
    } finally {
      this.internalNavigation = false
    }
  }

  private settingsFor(slide: Slide) {
    const info = this.info(slide.id)
    return this.registry().filter((setting) => setting.appliesTo(slide, info))
  }

  private slide(slideId: string) {
    return this.player.controller.state.deck?.slides.find((slide) => slide.id === slideId) ?? null
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
    open.cleanup?.(save)
    open.anchor.setAttribute('aria-expanded', 'false')
    open.anchor.focus()
    this.refresh()
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
      top = anchor.top - box.height - gap >= margin ? anchor.top - box.height - gap : anchor.bottom + gap
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
}
