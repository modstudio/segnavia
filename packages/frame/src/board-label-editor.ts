import { type Board, type BoardLabel, boardToScreen } from '@segnavia/format'
import type { SegnaviaBoard } from './board.ts'
import { editBoardFromFrame } from './board-editing-command.ts'
import type { BoardEditingBridge } from './board-editing-seam.ts'
import { boardPathElement } from './board-event-path.ts'
import { committedLabelText } from './board-label-editing.ts'
import type { BoardLabels } from './labels.ts'

type LabelEditorSource = Pick<BoardEditingBridge, 'value' | 'view' | 'shapes' | 'labelTextNode' | 'document'>

interface ActiveEditor {
  id: string
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
    private readonly labels: () => BoardLabels,
    private readonly change: (board: Board, kind: 'edit-label', id: string) => void,
    private readonly stateChanged: () => void,
  ) {
    board.addEventListener('keydown', this.onBoardKeyDown)
    board.addEventListener('segnavia-board-view', this.refresh)
  }

  get active() {
    return this.activeEditor !== null
  }

  detach() {
    this.board.removeEventListener('keydown', this.onBoardKeyDown)
    this.board.removeEventListener('segnavia-board-view', this.refresh)
    this.close(false, false)
  }

  refresh = () => {
    const active = this.activeEditor
    if (!active) return
    const label = this.source.value()?.labels.find((entry) => entry.id === active.id)
    if (!label) {
      this.close(false, false)
      return
    }
    this.place(active, label)
  }

  private onBoardKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.metaKey || event.ctrlKey || event.altKey || this.activeEditor || this.board.selection.length !== 1) return
    const id = this.board.selection[0]
    if (!id || !this.source.value()?.labels.some((label) => label.id === id)) return
    const labelTarget = boardPathElement(event, 'boardLabel')?.dataset.boardLabel
    if (event.composedPath()[0] !== this.board && labelTarget !== id) return
    event.preventDefault()
    this.open(id)
  }

  open(id: string) {
    const label = this.source.value()?.labels.find((entry) => entry.id === id)
    const hiddenText = this.source.labelTextNode(id)
    if (!label || !hiddenText) return
    this.close(false, false)
    this.board.selection = [id]
    const textarea = document.createElement('textarea')
    textarea.part.add('label-editor')
    textarea.dataset.labelEditor = id
    textarea.dir = 'auto'
    textarea.rows = 1
    textarea.value = label.text
    textarea.setAttribute('aria-label', this.labels().labelEdit)
    const active: ActiveEditor = {
      id,
      textarea,
      hiddenText,
      previousVisibility: hiddenText.style.visibility,
      growing: false,
    }
    this.activeEditor = active
    this.stateChanged()
    hiddenText.style.visibility = 'hidden'
    textarea.addEventListener('input', this.onInput)
    textarea.addEventListener('keydown', this.onEditorKeyDown)
    textarea.addEventListener('keyup', this.stopEditorKey)
    textarea.addEventListener('blur', this.onBlur)
    textarea.addEventListener('pointerdown', this.stopPointer)
    this.overlay.append(textarea)
    this.place(active, label)
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
  private onBlur = () => this.close(true, false)

  private close(save: boolean, focus = true) {
    const active = this.activeEditor
    if (!active) return
    this.activeEditor = null
    active.hiddenText.style.visibility = active.previousVisibility
    active.textarea.remove()
    this.stateChanged()
    if (save) {
      const board = this.source.value()
      const currentText = board?.labels.find((label) => label.id === active.id)?.text
      const text = currentText === undefined ? undefined : committedLabelText(currentText, active.textarea.value)
      if (text !== undefined) {
        if (board) {
          const result = editBoardFromFrame(this.source.document(board), [{ type: 'label-set', label: { id: active.id }, text }], this.source.shapes())
          if (result.ok) this.change(result.board, 'edit-label', active.id)
          else
            this.board.dispatchEvent(
              new CustomEvent('segnavia-board-edit-error', {
                detail: { edit: { kind: 'edit-label', ids: [active.id] }, error: result.refusal },
                bubbles: true,
                composed: true,
              }),
            )
        }
      }
    }
    if (focus) this.board.focus()
  }

  private place(active: ActiveEditor, label: BoardLabel) {
    const shape = this.source.shapes().labels[label.id]
    if (!shape) return
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
    textarea.style.direction = computed.direction
    textarea.style.whiteSpace = computed.whiteSpace
    const wraps = computed.whiteSpace !== 'pre'
    textarea.wrap = wraps ? 'soft' : 'off'
    textarea.style.width = `${shape.width * zoom}px`
    textarea.style.height = `${shape.height * zoom}px`
    if (!active.growing) return
    textarea.style.height = '0px'
    if (!wraps) textarea.style.width = '0px'
    textarea.style.width = `${Math.max(shape.width * zoom, textarea.scrollWidth)}px`
    textarea.style.height = `${Math.max(shape.height * zoom, textarea.scrollHeight)}px`
  }
}
