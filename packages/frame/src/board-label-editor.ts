import type { Board, BoardCommand } from '@segnavia/format'
import type { SegnaviaBoard } from './board.ts'
import { editBoardFromFrame } from './board-editing-command.ts'
import type { BoardEditingBridge } from './board-editing-seam.ts'
import type { BoardEdit } from './board-editing-types.ts'
import { committedLabelText } from './board-label-editing.ts'

type TextEditorSource = Pick<BoardEditingBridge, 'value' | 'computedShapes' | 'facts' | 'measureLabel' | 'document'>

export interface BoardTextTarget {
  id: string
  node: HTMLElement
  text: string
  command(text: string): BoardCommand
  edit: BoardEdit
  limit?: number
}

interface ActiveEditor {
  target: BoardTextTarget
  textarea: HTMLTextAreaElement
  previousVisibility: string
  growing: boolean
}

export function textWithinCodePointLimit(text: string, limit: number | undefined): string {
  return limit === undefined ? text : [...text].slice(0, Math.max(0, limit)).join('')
}

export function limitedInsertion(current: string, start: number, end: number, inserted: string, limit: number | undefined): string {
  if (limit === undefined) return inserted
  const retained = [...`${current.slice(0, start)}${current.slice(end)}`].length
  return [...inserted].slice(0, Math.max(0, limit - retained)).join('')
}

export class BoardTextEditor {
  private activeEditor: ActiveEditor | null = null

  constructor(
    private readonly board: SegnaviaBoard,
    private readonly overlay: HTMLElement,
    private readonly source: TextEditorSource,
    private readonly resolve: (id: string) => BoardTextTarget | undefined,
    private readonly change: (board: Board, edit: BoardEdit) => void,
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
    const target = this.resolve(active.target.id)
    if (!target) {
      this.close(false, false)
      return
    }
    active.target = target
    this.place(active)
  }

  private onBoardKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.metaKey || event.ctrlKey || event.altKey || this.activeEditor || this.board.selection.length !== 1) return
    const id = this.board.selection[0]
    const target = id ? this.resolve(id) : undefined
    if (!target || (event.composedPath()[0] !== this.board && !event.composedPath().includes(target.node))) return
    event.preventDefault()
    this.open(target)
  }

  open(target: BoardTextTarget) {
    this.close(false, false)
    this.board.selection = [target.id]
    const textarea = document.createElement('textarea')
    textarea.part.add('label-editor')
    textarea.dataset.labelEditor = target.id
    textarea.dir = 'auto'
    textarea.rows = 1
    textarea.value = textWithinCodePointLimit(target.text, target.limit)
    textarea.setAttribute('aria-label', target.node.getAttribute('aria-label') ?? target.text)
    const active: ActiveEditor = { target, textarea, previousVisibility: target.node.style.visibility, growing: false }
    this.activeEditor = active
    this.stateChanged()
    target.node.style.visibility = 'hidden'
    textarea.addEventListener('beforeinput', this.onBeforeInput)
    textarea.addEventListener('paste', this.onPaste)
    textarea.addEventListener('input', this.onInput)
    textarea.addEventListener('keydown', this.onEditorKeyDown)
    textarea.addEventListener('keyup', this.stopEditorKey)
    textarea.addEventListener('blur', this.onBlur)
    textarea.addEventListener('pointerdown', this.stopPointer)
    this.overlay.append(textarea)
    this.place(active)
    textarea.focus()
    textarea.setSelectionRange(textarea.value.length, textarea.value.length)
  }

  private onBeforeInput = (event: InputEvent) => {
    const textarea = this.activeEditor?.textarea
    if (!textarea || event.isComposing || !event.inputType.startsWith('insert') || event.inputType === 'insertFromPaste' || event.data === null) return
    const inserted = limitedInsertion(textarea.value, textarea.selectionStart, textarea.selectionEnd, event.data, this.activeEditor?.target.limit)
    if (inserted === event.data) return
    event.preventDefault()
    if (inserted) textarea.setRangeText(inserted, textarea.selectionStart, textarea.selectionEnd, 'end')
    this.grow()
  }

  private onPaste = (event: ClipboardEvent) => {
    const textarea = this.activeEditor?.textarea
    const pasted = event.clipboardData?.getData('text/plain')
    const limit = this.activeEditor?.target.limit
    if (!textarea || pasted === undefined || limit === undefined) return
    const inserted = limitedInsertion(textarea.value, textarea.selectionStart, textarea.selectionEnd, pasted, limit)
    event.preventDefault()
    if (inserted) textarea.setRangeText(inserted, textarea.selectionStart, textarea.selectionEnd, 'end')
    this.grow()
  }

  private onInput = () => {
    const active = this.activeEditor
    if (!active) return
    const bounded = textWithinCodePointLimit(active.textarea.value, active.target.limit)
    if (bounded !== active.textarea.value) active.textarea.value = bounded
    this.grow()
  }

  private grow() {
    const active = this.activeEditor
    if (!active) return
    active.growing = true
    this.place(active)
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
    active.target.node.style.visibility = active.previousVisibility
    active.textarea.remove()
    this.stateChanged()
    if (save) this.commit(active)
    if (focus) this.board.focus()
  }

  private commit(active: ActiveEditor) {
    const target = this.resolve(active.target.id)
    const text = target && committedLabelText(target.text, textWithinCodePointLimit(active.textarea.value, target.limit))
    const board = this.source.value()
    if (!target || text === undefined || !board) return
    const result = editBoardFromFrame(this.source.document(board), [target.command(text)], this.source)
    if (result.ok) this.change(result.board, target.edit)
    else
      this.board.dispatchEvent(
        new CustomEvent('segnavia-board-edit-error', { detail: { edit: target.edit, error: result.refusal }, bubbles: true, composed: true }),
      )
  }

  private place(active: ActiveEditor) {
    const targetBox = active.target.node.getBoundingClientRect()
    const overlayBox = this.overlay.getBoundingClientRect()
    const computed = getComputedStyle(active.target.node)
    const textarea = active.textarea
    textarea.style.left = `${targetBox.left - overlayBox.left}px`
    textarea.style.top = `${targetBox.top - overlayBox.top}px`
    textarea.style.font = computed.font
    textarea.style.letterSpacing = computed.letterSpacing
    textarea.style.lineHeight = computed.lineHeight
    textarea.style.textAlign = computed.textAlign
    textarea.style.direction = computed.direction
    textarea.style.whiteSpace = computed.whiteSpace
    const wraps = computed.whiteSpace !== 'pre'
    textarea.wrap = wraps ? 'soft' : 'off'
    textarea.style.width = `${targetBox.width}px`
    textarea.style.height = `${targetBox.height}px`
    if (!active.growing) return
    textarea.style.height = '0px'
    if (!wraps) textarea.style.width = '0px'
    textarea.style.width = `${Math.max(targetBox.width, textarea.scrollWidth)}px`
    textarea.style.height = `${Math.max(targetBox.height, textarea.scrollHeight)}px`
  }
}
