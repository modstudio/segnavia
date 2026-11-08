import type { Board } from './board.ts'
import type { BoardCommandOptions } from './board-command-core.ts'
import { BOARD_COMMAND_HANDLERS } from './board-command-handlers.ts'
import { BoardCommandRefusal } from './board-command-resolvers.ts'
import { BoardCommand } from './board-commands.ts'
import { type BoardEditAdjustment, type BoardEditResult, changedEntities, entityAt } from './board-edit-result.ts'
import type { ComputedBoardShapes } from './board-shapes.ts'
import type { Document } from './document.ts'
import { diffDocuments } from './document-diff.ts'
import { fingerprintDocument } from './document-fingerprint.ts'
import { boardFromDocument, documentFromBoard } from './document-lowering.ts'

function commandType(value: unknown): string {
  if (typeof value !== 'object' || value === null || typeof (value as { type?: unknown }).type !== 'string') return 'unknown'
  return (value as { type: string }).type
}

function refusal(index: number, type: string, problem: string, clearing: string): BoardEditResult {
  return { ok: false, refusal: `board command ${index} (${type}) refused: ${problem}; ${clearing}. Nothing was changed.` }
}

function fullAdjustments(board: Board, shapes: ComputedBoardShapes['shapes'], adjustments: BoardEditAdjustment[]): BoardEditAdjustment[] {
  const findEntity = entityAt(board, shapes)
  return adjustments.map((adjustment) => {
    const entity = findEntity(adjustment.id)
    return entity ? { ...adjustment, box: entity.box } : adjustment
  })
}

export function editBoard(document: Document, commands: BoardCommand[], shapes: ComputedBoardShapes, options: BoardCommandOptions = {}): BoardEditResult {
  const board = boardFromDocument(document)
  let current = board
  let currentShapes = shapes.shapes
  const adjustments: BoardEditAdjustment[] = []
  for (let index = 0; index < commands.length; index += 1) {
    const input: unknown = commands[index]
    const parsed = BoardCommand.safeParse(input)
    if (!parsed.success)
      return refusal(index, commandType(input), parsed.error.issues[0]?.message ?? 'the command is invalid', 'pass a command matching BoardCommand')
    try {
      const result = BOARD_COMMAND_HANDLERS[parsed.data.type](
        {
          board: current,
          shapes: currentShapes,
          provisional: new Set(shapes.provisional),
          estimated: new Set(shapes.estimated),
          options,
          command: index,
        },
        parsed.data,
      )
      current = result.board
      currentShapes = result.shapes
      adjustments.push(...result.adjustments)
    } catch (error) {
      if (error instanceof BoardCommandRefusal) return refusal(index, parsed.data.type, error.message, error.clearing)
      const message = error instanceof Error ? error.message : String(error)
      return refusal(index, parsed.data.type, message, 'correct the command or the board so the step can be established')
    }
  }
  const detail = options.detail ?? 'concise'
  const uniqueAdjustments = adjustments.filter(
    (adjustment, index, values) =>
      values.findIndex((entry) => entry.command === adjustment.command && entry.kind === adjustment.kind && entry.id === adjustment.id) === index,
  )
  const editedDocument = documentFromBoard(current, document)
  return {
    ok: true,
    board: current,
    document: editedDocument,
    batch: { base: fingerprintDocument(document), ops: diffDocuments(document, editedDocument) },
    changed: changedEntities(board, current, currentShapes, detail, shapes.shapes),
    adjustments: detail === 'full' ? fullAdjustments(current, currentShapes, uniqueAdjustments) : uniqueAdjustments,
    detail,
  }
}
