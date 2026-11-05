import type { BoardCommandHandler, CommandContext, CommandResult } from './board-command-items.ts'
import { requireItemShape } from './board-command-resolvers.ts'
import type { BoardCommand, BoardCommandOf } from './board-commands.ts'
import type { BoardEditAdjustment } from './board-edit-result.ts'
import { layoutSection } from './board-section-grid.ts'

function boardSet(context: CommandContext, command: BoardCommandOf<'board-set'>): CommandResult {
  const directionChanged = command.direction !== undefined && command.direction !== context.board.direction
  let board = {
    ...context.board,
    ...(command.title !== undefined ? { title: command.title } : {}),
    ...(command.direction !== undefined ? { direction: command.direction } : {}),
  }
  const adjustments: BoardEditAdjustment[] = []
  if (directionChanged) {
    for (const section of board.sections) {
      if (section.layout === 'manual') continue
      for (const id of section.items) requireItemShape(context.shapes, id)
      board = layoutSection(board, context.shapes, section.id)
      adjustments.push({
        command: context.command,
        kind: 'auto-layout',
        id: section.id,
        detail: `Laid out section "${section.id}" for ${board.direction} direction.`,
      })
    }
  }
  return { board, shapes: context.shapes, adjustments }
}

export const PROPERTY_COMMAND_HANDLERS: Record<Extract<BoardCommand['type'], 'board-set'>, BoardCommandHandler> = {
  'board-set': (context, command) => boardSet(context, command as BoardCommandOf<'board-set'>),
}
