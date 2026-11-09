import {
  type Board,
  type BoardLabel,
  type BoardShapes,
  type BoardView,
  boardToScreen,
  type Document,
  editBoard,
  labelDirection,
  labelXForWidth,
  type MeasuredSize,
  withLabelWidth,
} from '@segnavia/format'
import type { SegnaviaBoard } from './board.ts'
import { boardPathElement } from './board-event-path.ts'
import { committedLabelText } from './board-label-editing.ts'

interface LabelEditorSource {
  value(): Board | null
  view(): BoardView
  shape(id: string): { width: number; height: number } | undefined
  shapes(): BoardShapes
  labelShape(label: BoardLabel): MeasuredSize
  node(id: string): HTMLElement | undefined
  document(board: Board): Document
}

interface ActiveEditor {
  id: string
  oldText: string
  textarea: HTMLTextAreaElement
  hiddenText: HTMLElement
  previousVisibility: string
  growing: boolean
}

export class BoardLabelEditor {
  private activeEditor: ActiveEditor | null = null

  constructor(
    private readonly board: SegnaviaBoard,
    private readonly overlay: HTMLElement,
    private readonly source: LabelEditorSource,
    private readonly change: (board: Board, kind: 'edit-label' | 'resize', id: string) => void,
    private readonly stateChanged: () => void,
  ) {
    board.addEventListener('dblclick', this.onDoubleClick)
    board.addEventListener('keydown', this.onBoardKeyDown)
    board.addEventListener('segnavia-board-view', this.refresh)
  }

  get active(): boolean {
    return this.activeEditor !== null
  }

  detach() {
    this.board.removeEventListener('dblclick', this.onDoubleClick)
    this.board.removeEventListener('keydown', this.onBoardKeyDown)
    this.board.removeEventListener('segnavia-board-view', this.refresh)
    this.close(false, false)
  }

  refresh = () => {
    const active = this.activeEditor
    if (!active) return
    const label = this.source.value()?.labels.find((entry) => entry.id === active.id)
    if (!label) {
      this.close(false)
      return
    }
    this.place(active, label)
  }

  private onDoubleClick = (event: MouseEvent) => {
    const handleId = boardPathElement(event, 'labelResizeHandle')?.dataset.labelResizeHandle
    if (handleId) {
      this.clearWidth(handleId)
      event.preventDefault()
      return
    }
    const id = boardPathElement(event, 'boardLabel')?.dataset.boardLabel
    if (id) this.open(id)
  }

  private onBoardKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.metaKey || event.ctrlKey || event.altKey || this.activeEditor || this.board.selection.length !== 1) return
    const id = this.board.selection[0]
    if (!id || !this.source.value()?.labels.some((label) => label.id === id)) return
    event.preventDefault()
    this.open(id)
  }

  private open(id: string) {
    const label = this.source.value()?.labels.find((entry) => entry.id === id)
    const labelNode = this.source.node(id)
    const hiddenText = labelNode?.firstElementChild
    if (!label || !(hiddenText instanceof HTMLElement)) return
    this.close(false, false)
    this.board.selection = [id]
    const textarea = document.createElement('textarea')
    textarea.part.add('label-editor')
    textarea.dataset.labelEditor = id
    textarea.dir = 'auto'
    textarea.rows = 1
    textarea.value = label.text
    const active: ActiveEditor = {
      id,
      oldText: label.text,
      textarea,
      hiddenText,
      previousVisibility: hiddenText.style.visibility,
      growing: false,
    }
    this.activeEditor = active
    hiddenText.style.visibility = 'hidden'
    textarea.addEventListener('input', this.onInput)
    textarea.addEventListener('keydown', this.onEditorKeyDown)
    textarea.addEventListener('keyup', this.stopEditorKey)
    textarea.addEventListener('blur', this.onBlur)
    textarea.addEventListener('pointerdown', this.stopPointer)
    this.overlay.append(textarea)
    this.place(active, label)
    this.stateChanged()
    textarea.focus()
    textarea.setSelectionRange(textarea.value.length, textarea.value.length)
  }

  private onInput = () => {
    const active = this.activeEditor
    const label = active && this.source.value()?.labels.find((entry) => entry.id === active.id)
    if (!active || !label) return
    active.growing = true
    this.place(active, label)
  }

  private onEditorKeyDown = (event: KeyboardEvent) => {
    event.stopPropagation()
    if (event.isComposing || event.keyCode === 229) return
    if (event.key === 'Escape') {
      event.preventDefault()
      this.close(false)
    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      this.close(true)
    }
  }

  private stopEditorKey = (event: KeyboardEvent) => event.stopPropagation()
  private stopPointer = (event: PointerEvent) => event.stopPropagation()
  private onBlur = () => this.close(true)

  private close(save: boolean, focus = true) {
    const active = this.activeEditor
    if (!active) return
    this.activeEditor = null
    active.hiddenText.style.visibility = active.previousVisibility
    active.textarea.remove()
    if (save) {
      const text = committedLabelText(active.oldText, active.textarea.value)
      if (text !== undefined) {
        const board = this.source.value()
        if (board) {
          const result = editBoard(this.source.document(board), [{ type: 'label-set', label: { id: active.id }, text }], {
            shapes: this.source.shapes(),
            provisional: [],
            estimated: [],
          })
          if (result.ok) this.change(result.board, 'edit-label', active.id)
        }
      }
    }
    this.stateChanged()
    if (focus) this.board.focus()
  }

  private place(active: ActiveEditor, label: BoardLabel) {
    const shape = this.source.shape(label.id)
    const labelNode = this.source.node(label.id)
    if (!shape || !labelNode) return
    const point = boardToScreen(this.source.view(), label)
    const zoom = this.source.view().zoom
    const computed = getComputedStyle(active.hiddenText)
    const textarea = active.textarea
    textarea.style.left = `${point.x}px`
    textarea.style.top = `${point.y}px`
    textarea.style.font = computed.font
    textarea.style.letterSpacing = computed.letterSpacing
    textarea.style.lineHeight = computed.lineHeight
    textarea.style.textAlign = computed.textAlign
    textarea.style.direction = labelDirection(label)
    textarea.wrap = label.width === undefined ? 'off' : 'soft'
    textarea.style.whiteSpace = label.width === undefined ? 'pre' : 'pre-wrap'
    textarea.style.width = `${shape.width * zoom}px`
    textarea.style.height = `${shape.height * zoom}px`
    if (!active.growing) return
    textarea.style.height = '0px'
    if (label.width === undefined) textarea.style.width = '0px'
    textarea.style.width = `${Math.max(shape.width * zoom, textarea.scrollWidth)}px`
    textarea.style.height = `${Math.max(shape.height * zoom, textarea.scrollHeight)}px`
  }

  private clearWidth(id: string) {
    const board = this.source.value()
    const label = board?.labels.find((entry) => entry.id === id)
    const currentWidth = this.source.shape(id)?.width
    if (!board || !label || label.width === undefined || currentWidth === undefined) return
    const unwrapped = withLabelWidth(label, undefined)
    const anchored = { ...unwrapped, x: labelXForWidth(label, currentWidth, this.source.labelShape(unwrapped).width) }
    this.change({ ...board, labels: board.labels.map((entry) => (entry.id === id ? anchored : entry)) }, 'resize', id)
  }
}
