import type { Board } from '@segnavia/format'
import type { SegnaviaBoard } from './board.ts'
import type { BoardEditingBridge } from './board-editing-seam.ts'
import type { BoardEdit, BoardEditingOptions, BoardEditorFlags } from './board-editing-types.ts'
import { boardPathElement } from './board-event-path.ts'
import { BoardLabelDoubleClick } from './board-label-double-click.ts'
import { withoutLabelWidth } from './board-label-editing.ts'
import { BoardTextEditor, type BoardTextTarget } from './board-text-editor.ts'
import { type BoardLabels, boardLabels } from './labels.ts'

export function labelEditRefusal(board: Board | null, id: string, enabled: boolean): string | undefined {
  if (!board?.labels.some((entry) => entry.id === id)) return `label id ${id} does not exist; pass the id of a label on the board`
  return enabled ? undefined : 'label text editing is switched off; set editors.labelText to true'
}

export function labelTextTarget(label: Board['labels'][number], node: HTMLElement, focusNode: HTMLElement, ariaLabel: string, limit?: number): BoardTextTarget {
  return {
    id: label.id,
    node,
    focusNode,
    text: label.text,
    ariaLabel,
    command: (text) => ({ type: 'label-set', label: { id: label.id }, text }),
    edit: { kind: 'edit-label', ids: [label.id] },
    limit,
  }
}

export function sectionTitleTarget(section: Board['sections'][number], node: HTMLElement, ariaLabel: string): BoardTextTarget {
  return {
    id: section.id,
    node,
    focusNode: node,
    text: section.title,
    ariaLabel,
    command: (title) => ({ type: 'section-set', section: { id: section.id }, title }),
    edit: { kind: 'rename-section', ids: [section.id] },
  }
}

export function boardTextTarget(
  board: Board | null,
  id: string,
  enabled: BoardEditorFlags,
  nodes: Pick<BoardEditingBridge, 'focusNode' | 'labelTextNode' | 'sectionTitleNode'>,
  labels: Pick<BoardLabels, 'labelEdit' | 'sectionTitleEdit'>,
  labelLimit?: number,
): BoardTextTarget | undefined {
  const label = enabled.labelText ? board?.labels.find((entry) => entry.id === id) : undefined
  const labelNode = label ? nodes.labelTextNode(id) : undefined
  const labelFocusNode = label ? nodes.focusNode(id) : undefined
  if (label && labelNode && labelFocusNode) return labelTextTarget(label, labelNode, labelFocusNode, labels.labelEdit, labelLimit)
  const section = enabled.sectionTitle ? board?.sections.find((entry) => entry.id === id) : undefined
  const sectionNode = section ? nodes.sectionTitleNode(id) : undefined
  return section && sectionNode ? sectionTitleTarget(section, sectionNode, labels.sectionTitleEdit) : undefined
}

export class BoardTextEditing {
  private readonly doubleClick = new BoardLabelDoubleClick()
  private readonly editor: BoardTextEditor
  private capturedSection: string | undefined

  constructor(
    private readonly board: SegnaviaBoard,
    private readonly bridge: BoardEditingBridge,
    private readonly enabled: BoardEditorFlags,
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
    const target = this.resolve(id)
    if (!target) return { ok: false, refusal: `label id ${id} is not rendered yet; call editLabel again after the board renders it` }
    this.editor.open(target)
    return { ok: true }
  }

  refresh = () => this.editor.refresh()

  detach() {
    this.board.removeEventListener('dblclick', this.onDoubleClick)
    this.editor.detach()
  }

  private resolve = (id: string): BoardTextTarget | undefined => {
    return boardTextTarget(this.bridge.value(), id, this.enabled, this.bridge, boardLabels(this.board.labels), this.limits?.labelTextChars)
  }

  private onDoubleClick = (event: MouseEvent) => {
    const target = this.doubleClick.resolve(event)
    if (target?.kind === 'handle' && this.enabled.labelResize) {
      const next = withoutLabelWidth(this.bridge.value(), target.id, this.bridge.shapes(), this.bridge.labelShape)
      if (next) this.apply(next, { kind: 'resize', ids: [target.id] })
      event.preventDefault()
      return
    }
    if (target?.kind === 'label') {
      const label = this.resolve(target.id)
      if (label) this.editor.open(label)
      return
    }
    const id = boardPathElement(event, 'boardSectionTitle')?.dataset.boardSectionTitle ?? this.capturedSection
    this.capturedSection = undefined
    const section = id ? this.resolve(id) : undefined
    if (section) this.editor.open(section)
  }
}
