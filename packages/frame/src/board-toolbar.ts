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
    const focusedPart = (this.root.activeElement as HTMLElement | null)?.dataset.action
    const previousTabStop = this.toolbar.querySelector<HTMLButtonElement>('button[tabindex="0"]')?.dataset.action
    this.dir = board?.direction ?? ''
    this.toolbar.setAttribute('aria-label', labels.toolbar)
    const controls = [
      this.button('zoom-out', labels.zoomOut, !board || zoom <= MIN_BOARD_ZOOM + EPSILON),
      this.button('zoom-level', labels.resetZoom, !board, labels.zoomLevel(Math.round(zoom * 100))),
      this.button('zoom-in', labels.zoomIn, !board || zoom >= MAX_BOARD_ZOOM - EPSILON),
      this.button('fit', labels.fit, !board),
    ]
    if (this.shareable) controls.push(this.button('share', labels.share, false))
    this.toolbar.replaceChildren(...controls)
    const enabled = controls.filter((button) => !button.disabled)
    const tabStop = enabled.find((button) => button.dataset.action === (focusedPart ?? previousTabStop)) ?? enabled[0]
    for (const button of controls) button.tabIndex = button === tabStop ? 0 : -1
    if (focusedPart) tabStop?.focus()
  }

  private button(action: string, label: string, disabled: boolean, text?: string): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.part.add(action)
    button.dataset.action = action
    button.setAttribute('aria-label', label)
    button.disabled = disabled
    const icon = document.createElement('span')
    icon.part.add('icon')
    button.append(icon)
    if (text !== undefined) button.append(document.createTextNode(text))
    return button
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
    const buttons = [...this.toolbar.querySelectorAll('button')]
    const current = buttons.indexOf(event.target as HTMLButtonElement)
    const next = toolbarNextIndex(
      buttons.map((button) => !button.disabled),
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
