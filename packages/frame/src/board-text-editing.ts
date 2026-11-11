import type { Board } from '@segnavia/format'
import type { SegnaviaBoard } from './board.ts'
import type { BoardEditingBridge } from './board-editing-seam.ts'
import type { BoardEdit, BoardEditingOptions } from './board-editing-types.ts'
import { boardPathElement } from './board-event-path.ts'
import { BoardLabelDoubleClick } from './board-label-double-click.ts'
import { withoutLabelWidth } from './board-label-editing.ts'
import { BoardTextEditor, type BoardTextTarget } from './board-label-editor.ts'

type TextEditors = Record<'labelText' | 'labelResize' | 'sectionTitle', boolean>

export function labelEditRefusal(board: Board | null, id: string, enabled: boolean): string | undefined {
  if (!board?.labels.some((entry) => entry.id === id)) return `label id ${id} does not exist; pass the id of a label on the board`
  return enabled ? undefined : 'label text editing is switched off; set editors.labelText to true'
}

export function labelTextTarget(label: Board['labels'][number], node: HTMLElement, limit?: number): BoardTextTarget {
  return {
    id: label.id,
    node,
    text: label.text,
    command: (text) => ({ type: 'label-set', label: { id: label.id }, text }),
    edit: { kind: 'edit-label', ids: [label.id] },
    limit,
  }
}

export function sectionTitleTarget(section: Board['sections'][number], node: HTMLElement): BoardTextTarget {
  return {
    id: section.id,
    node,
    text: section.title,
    command: (title) => ({ type: 'section-set', section: { id: section.id }, title }),
    edit: { kind: 'rename-section', ids: [section.id] },
  }
}

export class BoardTextEditing {
  private readonly doubleClick = new BoardLabelDoubleClick()
  private readonly editor: BoardTextEditor
  private capturedSection: string | undefined

  constructor(
    private readonly board: SegnaviaBoard,
    private readonly bridge: BoardEditingBridge,
    private readonly enabled: TextEditors,
    private readonly limits: BoardEditingOptions['limits'],
    private readonly apply: (board: Board, edit: BoardEdit) => void,
    stateChanged: () => void,
  ) {
    this.editor = new BoardTextEditor(board, bridge.overlay, bridge, this.resolve, apply, stateChanged)
    board.addEventListener('dblclick', this.onDoubleClick)
  }

  get active() {
    return this.editor.active
  }

  capture(event: PointerEvent) {
    this.doubleClick.capture(event)
    this.capturedSection = boardPathElement(event, 'boardSectionTitle')?.dataset.boardSectionTitle
  }

  editLabel(id: string): { ok: true } | { ok: false; refusal: string } {
    const refusal = labelEditRefusal(this.bridge.value(), id, this.enabled.labelText)
    if (refusal) return { ok: false, refusal }
    const target = this.labelTarget(id)
    if (!target) return { ok: false, refusal: `label id ${id} does not exist; pass the id of a label on the board` }
    this.editor.open(target)
    return { ok: true }
  }

  refresh = () => this.editor.refresh()

  detach() {
    this.board.removeEventListener('dblclick', this.onDoubleClick)
    this.editor.detach()
  }

  private resolve = (id: string): BoardTextTarget | undefined => {
    if (this.enabled.labelText) {
      const label = this.labelTarget(id)
      if (label) return label
    }
    return this.enabled.sectionTitle ? this.sectionTarget(id) : undefined
  }

  private labelTarget(id: string): BoardTextTarget | undefined {
    const label = this.bridge.value()?.labels.find((entry) => entry.id === id)
    const node = this.bridge.labelTextNode(id)
    return label && node ? labelTextTarget(label, node, this.limits?.labelTextChars) : undefined
  }

  private sectionTarget(id: string): BoardTextTarget | undefined {
    const section = this.bridge.value()?.sections.find((entry) => entry.id === id)
    const node = this.bridge.sectionTitleNode(id)
    return section && node ? sectionTitleTarget(section, node) : undefined
  }

  private onDoubleClick = (event: MouseEvent) => {
    const target = this.doubleClick.resolve(event)
    if (target?.kind === 'handle' && this.enabled.labelResize) {
      const next = withoutLabelWidth(this.bridge.value(), target.id, this.bridge.shapes(), this.bridge.labelShape)
      if (next) this.apply(next, { kind: 'resize', ids: [target.id] })
      event.preventDefault()
      return
    }
    if (target?.kind === 'label' && this.enabled.labelText) {
      const label = this.labelTarget(target.id)
      if (label) this.editor.open(label)
      return
    }
    if (!this.enabled.sectionTitle) return
    const id = boardPathElement(event, 'boardSectionTitle')?.dataset.boardSectionTitle ?? this.capturedSection
    this.capturedSection = undefined
    const section = id ? this.sectionTarget(id) : undefined
    if (section) this.editor.open(section)
  }
}
