import type { Board } from './board.ts'
import { BoardCommandRefusal, requireItemShape, requireLabelShape } from './board-command-resolvers.ts'
import type { BoardTargetPlacement } from './board-command-targets.ts'
import type { BoardCommand } from './board-commands.ts'
import type { BoardEditAdjustment } from './board-edit-result.ts'
import type { BoardShapes } from './board-geometry.ts'
import { settleBoard } from './board-sections.ts'
import type { BoardItemFact, BoardShapesOptions } from './board-shapes.ts'
import { defaultNewId } from './document-identity.ts'

export interface BoardCommandOptions {
  newId?: () => string
  detail?: 'concise' | 'full'
  facts?: Readonly<Record<string, BoardItemFact>>
  measureLabel?: BoardShapesOptions['measureLabel']
}

export interface CommandContext {
  board: Board
  shapes: BoardShapes
  provisional: ReadonlySet<string>
  estimated: ReadonlySet<string>
  options: BoardCommandOptions
  command: number
}

export interface CommandResult {
  board: Board
  shapes: BoardShapes
  adjustments: BoardEditAdjustment[]
}

export type BoardCommandHandler = (context: CommandContext, command: BoardCommand) => CommandResult

export function newEntityId(context: CommandContext, supplied: string | undefined, description: string): { id: string; adjustment?: BoardEditAdjustment } {
  const id = supplied ?? (context.options.newId ?? defaultNewId)()
  if (!id) throw new BoardCommandRefusal(`the new ${description} has no id`, 'supply an id or return a non-empty id from newId')
  if ([...context.board.items, ...context.board.labels, ...context.board.sections].some((entry) => entry.id === id))
    throw new BoardCommandRefusal(`id "${id}" already exists`, 'supply a unique id')
  return {
    id,
    ...(supplied === undefined
      ? { adjustment: { command: context.command, kind: 'generated-id' as const, id, detail: `Generated id "${id}" with options.newId.` } }
      : {}),
  }
}

export function shapeAdjustments(context: CommandContext, ids: readonly string[]): BoardEditAdjustment[] {
  return ids.flatMap((id) => {
    if (context.provisional.has(id))
      return [{ command: context.command, kind: 'provisional-shape', id, detail: `Used the provisional shape supplied for item "${id}".` }]
    return []
  })
}

export function requireShapes(board: Board, shapes: BoardShapes): void {
  for (const item of board.items) requireItemShape(shapes, item.id)
  for (const label of board.labels) requireLabelShape(shapes, label.id)
}

export function placementAdjustments(context: CommandContext, placement: BoardTargetPlacement): BoardEditAdjustment[] {
  return placement.nudges.map(({ kind, id }) => ({
    command: context.command,
    kind: 'nudge',
    id,
    detail: `Nudged the placed items farther away to clear ${kind} "${id}".`,
  }))
}

export function placementEstimatedLabels(placement: BoardTargetPlacement): string[] {
  return [...placement.usedEstimatedLabels, ...placement.nudges.filter((entry) => entry.kind === 'label').map((entry) => entry.id)]
}

export function settled(
  context: CommandContext,
  intended: Board,
  shapes: BoardShapes,
  touched: readonly string[],
  adjustments: BoardEditAdjustment[],
  usedEstimatedLabels: readonly string[] = [],
): CommandResult {
  requireShapes(intended, shapes)
  const board = settleBoard(context.board, intended, shapes, touched)
  const intendedPositions = new Map([
    ...intended.items.map((item) => [item.id, `${item.x}:${item.y}:${item.width}`] as const),
    ...intended.labels.map((label) => [label.id, `${label.x}:${label.y}`] as const),
    ...intended.sections.map((section) => [section.id, JSON.stringify(section.rectangle)] as const),
  ])
  const settledIds = new Set<string>()
  for (const entity of [...board.items, ...board.labels, ...board.sections]) {
    const value =
      'rectangle' in entity ? JSON.stringify(entity.rectangle) : 'width' in entity ? `${entity.x}:${entity.y}:${entity.width}` : `${entity.x}:${entity.y}`
    if (intendedPositions.get(entity.id) !== value) {
      adjustments.push({ command: context.command, kind: 'settle', id: entity.id, detail: `Settling adjusted "${entity.id}" to preserve board layout.` })
      settledIds.add(entity.id)
    }
  }
  const estimatedUsed = new Set([...usedEstimatedLabels, ...[...settledIds].filter((id) => context.board.labels.some((label) => label.id === id))])
  for (const id of estimatedUsed)
    if (context.estimated.has(id))
      adjustments.push({ command: context.command, kind: 'estimated-shape', id, detail: `Used the estimated shape supplied for label "${id}".` })
  return { board, shapes, adjustments }
}
