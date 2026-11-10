import type {
  ArrangeOptions,
  BoardCommand,
  BoardEditResult,
  BoardItem,
  ComputedBoardShapes,
  Document,
  DocumentBatch,
  DocumentOp,
  Point,
} from '@segnavia/format'

type EditKind = 'move' | 'resize' | 'remove' | 'add' | 'arrange' | 'move-section' | 'settle' | 'edit-label'
type DirectBoardEdit = { [Kind in EditKind]: { kind: Kind; ids: string[] } }[EditKind]
type HostBoardEdit = { kind: 'apply'; label: string; ids: string[] }
type CommandBoardEdit = { kind: 'command'; label: string; ids: string[] }
type HistoryBoardEdit = { [Kind in 'undo' | 'redo']: { kind: Kind; edit: BoardEdit } }['undo' | 'redo']
export type BoardEdit = DirectBoardEdit | HostBoardEdit | CommandBoardEdit | HistoryBoardEdit

export interface BoardChange {
  board: Document
  before: Document
  batch: DocumentBatch
  edit: BoardEdit
  signal: AbortSignal
}

export interface AddBoardItemInput {
  kind: BoardItem['kind']
  address: string
  width?: number
}

export interface BoardEditingOptions {
  change(change: BoardChange): Promise<void>
  editors?: Partial<Record<'move' | 'resize' | 'remove' | 'add' | 'arrange', boolean>>
  defaultWidth?: Partial<Record<BoardItem['kind'], number>>
}

export interface BoardEditing {
  detach(): void
  add(input: AddBoardItemInput, at?: Point): string | undefined
  remove(ids?: readonly string[]): void
  arrange(options: ArrangeOptions): void
  apply(ops: readonly DocumentOp[], label: string): void
  command(commands: BoardCommand[], label: string): BoardEditResult
  shapes(): ComputedBoardShapes
  applyRemote(batch: DocumentBatch): void
  undo(): void
  redo(): void
  readonly canUndo: boolean
  readonly canRedo: boolean
}
