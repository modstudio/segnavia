import { MAX_BOARD_ZOOM, MIN_BOARD_ZOOM } from '@segnavia/format'
import { ensureBaseStyle } from './base-style.ts'
import type { SegnaviaBoard } from './board.ts'
import { BoardTargetBinding } from './board-target.ts'
import { type ToolbarNavigationKey, toolbarNextIndex } from './board-toolbar-policy.ts'

export interface BoardToolbarLabels {
  toolbar: string
  zoomOut: string
  zoomIn: string
  zoomLevel: (percent: number) => string
  resetZoom: string
  fit: string
  share: string
}

const ENGLISH_BOARD_TOOLBAR_LABELS: BoardToolbarLabels = {
  toolbar: 'Board tools',
  zoomOut: 'Zoom out',
  zoomIn: 'Zoom in',
  zoomLevel: (percent) => `${percent}%`,
  resetZoom: 'Zoom to 100%',
  fit: 'Zoom to fit',
  share: 'Share',
}

const EPSILON = 1e-9

export class SegnaviaBoardToolbar extends HTMLElement {
  static observedAttributes = ['for', 'shareable']

  private labelOverrides: Partial<BoardToolbarLabels> = {}
  private readonly root = this.attachShadow({ mode: 'open' })
  private readonly toolbar = document.createElement('div')
  private readonly zoomOutButton: HTMLButtonElement
  private readonly zoomLevelButton: HTMLButtonElement
  private readonly zoomLevelText = document.createTextNode('')
  private readonly zoomInButton: HTMLButtonElement
  private readonly fitButton: HTMLButtonElement
  private readonly shareButton: HTMLButtonElement
  private readonly controls: readonly HTMLButtonElement[]
  private readonly targetBinding = new BoardTargetBinding(
    this,
    {
      'segnavia-board-view': () => this.render(),
      'segnavia-board-change': () => this.render(),
    },
    () => this.render(),
  )

  constructor() {
    super()
    this.toolbar.part.add('toolbar')
    this.toolbar.setAttribute('role', 'toolbar')
    this.zoomOutButton = this.button('zoom-out')
    this.zoomLevelButton = this.button('zoom-level')
    this.zoomLevelButton.append(this.zoomLevelText)
    this.zoomInButton = this.button('zoom-in')
    this.fitButton = this.button('fit')
    this.shareButton = this.button('share')
    this.controls = [this.zoomOutButton, this.zoomLevelButton, this.zoomInButton, this.fitButton, this.shareButton]
    this.toolbar.append(...this.controls)
    this.root.append(this.toolbar)
  }

  get target(): SegnaviaBoard | null {
    return this.targetBinding.target
  }

  set target(value: SegnaviaBoard | null) {
    this.targetBinding.target = value
  }

  get shareable(): boolean {
    return this.hasAttribute('shareable')
  }

  set shareable(value: boolean) {
    this.toggleAttribute('shareable', value)
  }

  get labels(): Partial<BoardToolbarLabels> {
    return this.labelOverrides
  }

  set labels(value: Partial<BoardToolbarLabels>) {
    this.labelOverrides = value
    this.render()
  }

  connectedCallback() {
    ensureBaseStyle(this.toolbar)
    this.toolbar.addEventListener('click', this.onClick)
    this.toolbar.addEventListener('keydown', this.onKeyDown)
    this.targetBinding.connect()
    this.render()
  }

  disconnectedCallback() {
    this.toolbar.removeEventListener('click', this.onClick)
    this.toolbar.removeEventListener('keydown', this.onKeyDown)
    this.targetBinding.disconnect()
  }

  attributeChangedCallback(name: string) {
    if (name === 'for') this.targetBinding.attributeChanged()
    else this.render()
  }

  private render = () => {
    const labels = { ...ENGLISH_BOARD_TOOLBAR_LABELS, ...this.labelOverrides }
    const target = this.targetBinding.current
    const board = target?.board
    const zoom = target?.view.zoom ?? 1
    const focused = this.root.activeElement instanceof HTMLButtonElement ? this.root.activeElement : null
    const previousTabStop = this.controls.find((button) => button.tabIndex === 0)
    this.dir = board?.direction ?? ''
    this.toolbar.setAttribute('aria-label', labels.toolbar)
    this.updateButton(this.zoomOutButton, labels.zoomOut, !board || zoom <= MIN_BOARD_ZOOM + EPSILON)
    this.updateButton(this.zoomLevelButton, labels.resetZoom, !board)
    this.zoomLevelText.data = labels.zoomLevel(Math.round(zoom * 100))
    this.updateButton(this.zoomInButton, labels.zoomIn, !board || zoom >= MAX_BOARD_ZOOM - EPSILON)
    this.updateButton(this.fitButton, labels.fit, !board)
    this.updateButton(this.shareButton, labels.share, false)
    this.shareButton.hidden = !this.shareable
    const enabled = this.controls.filter((button) => !button.disabled && !button.hidden)
    const tabStop =
      (focused && enabled.includes(focused) ? focused : undefined) ??
      (previousTabStop && enabled.includes(previousTabStop) ? previousTabStop : undefined) ??
      enabled[0]
    for (const button of this.controls) button.tabIndex = button === tabStop ? 0 : -1
    if (focused && focused !== tabStop) tabStop?.focus()
  }

  private button(action: string): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.part.add(action)
    button.dataset.action = action
    if (action !== 'zoom-level') {
      const icon = document.createElement('span')
      const slot = document.createElement('slot')
      icon.part.add('icon')
      slot.name = `icon-${action}`
      icon.append(slot)
      button.append(icon)
    }
    return button
  }

  private updateButton(button: HTMLButtonElement, label: string, disabled: boolean) {
    button.setAttribute('aria-label', label)
    button.disabled = disabled
  }

  private onClick = (event: MouseEvent) => {
    const button = event.composedPath().find((node): node is HTMLButtonElement => node instanceof HTMLButtonElement)
    const target = this.targetBinding.current
    if (!button || button.disabled) return
    if (button.dataset.action === 'zoom-out') target?.zoomOut()
    else if (button.dataset.action === 'zoom-level') target?.zoomTo(1)
    else if (button.dataset.action === 'zoom-in') target?.zoomIn()
    else if (button.dataset.action === 'fit') target?.fitAll()
    else if (button.dataset.action === 'share') {
      this.dispatchEvent(new CustomEvent('segnavia-board-share', { bubbles: true, composed: true, detail: { board: target?.board ?? null } }))
    }
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    const buttons = [...this.controls]
    const current = buttons.indexOf(event.target as HTMLButtonElement)
    const next = toolbarNextIndex(
      buttons.map((button) => !button.disabled && !button.hidden),
      current,
      event.key as ToolbarNavigationKey,
      this.dir === 'rtl',
    )
    if (next < 0) return
    event.preventDefault()
    for (const [index, button] of buttons.entries()) button.tabIndex = index === next ? 0 : -1
    buttons[next]?.focus()
  }
}
