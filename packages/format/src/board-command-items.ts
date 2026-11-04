import type { Board, BoardItem } from './board.ts'
import { BoardCommandRefusal, resolveItem, resolveItems, resolveSection } from './board-command-resolvers.ts'
import { type BoardTargetPlacement, placeBoardTarget } from './board-command-targets.ts'
import type { BoardCommand, BoardCommandOf } from './board-commands.ts'
import { addItem, type BoardItemAnchor, MIN_BOARD_ITEM_WIDTH, removeItems, resizeItem } from './board-edit.ts'
import type { BoardEditAdjustment } from './board-edit-result.ts'
import { arrange, type BoardShapes, defaultGridColumns } from './board-geometry.ts'
import { removeFromGrid } from './board-section-grid.ts'
import { SECTION_GAP, SECTION_PADDING, SECTION_TITLE_ROOM, settleBoard } from './board-sections.ts'
import type { BoardItemFact } from './board-shapes.ts'
import { resolvedShape } from './board-shapes.ts'

export const DEFAULT_BOARD_ITEM_WIDTH = 320

export interface BoardCommandOptions {
  newId?: () => string
  detail?: 'concise' | 'full'
  facts?: Readonly<Record<string, BoardItemFact>>
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

function shapeAdjustments(context: CommandContext, ids: readonly string[]): BoardEditAdjustment[] {
  return ids.flatMap((id) => {
    if (context.provisional.has(id))
      return [{ command: context.command, kind: 'provisional-shape', id, detail: `Used the provisional shape supplied for item "${id}".` }]
    return []
  })
}

function requireShapes(board: Board, shapes: BoardShapes): void {
  for (const item of board.items)
    if (!shapes.items[item.id]) throw new BoardCommandRefusal(`item "${item.id}" has no resolved shape`, `pass the resolved shape for item "${item.id}"`)
  for (const label of board.labels)
    if (!shapes.labels[label.id]) throw new BoardCommandRefusal(`label "${label.id}" has no resolved shape`, `pass the resolved shape for label "${label.id}"`)
}

function placementAdjustments(context: CommandContext, placement: BoardTargetPlacement): BoardEditAdjustment[] {
  return placement.nudges.map(({ kind, id }) => ({
    command: context.command,
    kind: 'nudge',
    id,
    detail: `Nudged the placed items farther away to clear ${kind} "${id}".`,
  }))
}

function settled(
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

function requirePositiveWidth(width: number): void {
  if (!(width > 0)) throw new BoardCommandRefusal(`width ${width} is not positive`, 'pass a width greater than zero')
}

function addShape(context: CommandContext, command: BoardCommandOf<'item-add'>, id: string): { shapes: BoardShapes; provisionalId?: string } {
  const fact = context.options.facts?.[command.address]
  if (fact) {
    if (fact.kind !== command.kind)
      throw new BoardCommandRefusal(
        `address "${command.address}" has a ${fact.kind} shape fact instead of ${command.kind}`,
        `pass a ${command.kind} fact for address "${command.address}"`,
      )
    return { shapes: { ...context.shapes, items: { ...context.shapes.items, [id]: resolvedShape(fact) } } }
  }
  const sameAddress = context.board.items.find((item) => item.address === command.address)
  if (sameAddress && sameAddress.kind !== command.kind)
    throw new BoardCommandRefusal(
      `address "${command.address}" belongs to a ${sameAddress.kind} item instead of ${command.kind}`,
      `pass a ${command.kind} fact for a distinct address`,
    )
  const shape = sameAddress ? context.shapes.items[sameAddress.id] : undefined
  if (!shape)
    throw new BoardCommandRefusal(`address "${command.address}" has no resolved shape`, `pass its resolved fact in options.facts["${command.address}"]`)
  return {
    shapes: { ...context.shapes, items: { ...context.shapes.items, [id]: shape } },
    provisionalId: context.provisional.has(sameAddress?.id ?? '') ? id : undefined,
  }
}

function itemAdd(context: CommandContext, command: BoardCommandOf<'item-add'>): CommandResult {
  const generated = command.id === undefined
  const id = command.id ?? context.options.newId?.()
  if (!id) throw new BoardCommandRefusal('the new item has no id', 'supply an id or a newId option')
  if ([...context.board.items, ...context.board.labels, ...context.board.sections].some((entry) => entry.id === id))
    throw new BoardCommandRefusal(`id "${id}" already exists`, 'supply a unique id')
  const width = command.width ?? DEFAULT_BOARD_ITEM_WIDTH
  requirePositiveWidth(width)
  const supplied = addShape(context, command, id)
  const item: BoardItem = { id, kind: command.kind, address: command.address, x: 0, y: 0, width }
  const added = addItem(context.board, item)
  requireShapes(added, supplied.shapes)
  const placement = placeBoardTarget(added, supplied.shapes, [id], command.target)
  const adjustments: BoardEditAdjustment[] = []
  if (generated) adjustments.push({ command: context.command, kind: 'generated-id', id, detail: `Generated id "${id}" with options.newId.` })
  if (command.width === undefined)
    adjustments.push({ command: context.command, kind: 'default-width', id, detail: `Used the default item width ${DEFAULT_BOARD_ITEM_WIDTH}.` })
  if (supplied.provisionalId)
    adjustments.push({
      command: context.command,
      kind: 'provisional-shape',
      id,
      detail: `Used the provisional shape supplied for address "${command.address}".`,
    })
  adjustments.push(...placementAdjustments(context, placement))
  return settled(context, placement.board, supplied.shapes, [id], adjustments, [
    ...placement.usedEstimatedLabels,
    ...placement.nudges.filter((entry) => entry.kind === 'label').map((entry) => entry.id),
  ])
}

function itemRemove(context: CommandContext, command: BoardCommandOf<'item-remove'>): CommandResult {
  const items = resolveItems(context.board, command.items)
  const ids = items.map((item) => item.id)
  const intended = removeItems(removeFromGrid(context.board, context.shapes, ids), ids)
  return settled(context, intended, context.shapes, ids, shapeAdjustments(context, ids))
}

function itemMove(context: CommandContext, command: BoardCommandOf<'item-move'>): CommandResult {
  const items = resolveItems(context.board, command.items)
  const ids = items.map((item) => item.id)
  for (const id of ids)
    if (!context.shapes.items[id]) throw new BoardCommandRefusal(`item "${id}" has no resolved shape`, `pass the resolved shape for item "${id}"`)
  requireShapes(context.board, context.shapes)
  const placement = placeBoardTarget(context.board, context.shapes, ids, command.target)
  return settled(
    context,
    placement.board,
    context.shapes,
    ids,
    [...shapeAdjustments(context, ids), ...placementAdjustments(context, placement)],
    [...placement.usedEstimatedLabels, ...placement.nudges.filter((entry) => entry.kind === 'label').map((entry) => entry.id)],
  )
}

type LogicalAnchor = NonNullable<BoardCommandOf<'item-resize'>['anchor']>
const PHYSICAL_ANCHOR: Record<Board['direction'], Record<LogicalAnchor, BoardItemAnchor>> = {
  ltr: { 'top-start': 'top-left', 'top-end': 'top-right', 'bottom-start': 'bottom-left', 'bottom-end': 'bottom-right' },
  rtl: { 'top-start': 'top-right', 'top-end': 'top-left', 'bottom-start': 'bottom-right', 'bottom-end': 'bottom-left' },
}

export function physicalItemAnchor(direction: Board['direction'], anchor: LogicalAnchor): BoardItemAnchor {
  return PHYSICAL_ANCHOR[direction][anchor]
}

function itemResize(context: CommandContext, command: BoardCommandOf<'item-resize'>): CommandResult {
  requirePositiveWidth(command.width)
  const item = resolveItem(context.board, command.item)
  const shape = context.shapes.items[item.id]
  if (!shape) throw new BoardCommandRefusal(`item "${item.id}" has no resolved shape`, `pass the resolved shape for item "${item.id}"`)
  const anchor = physicalItemAnchor(context.board.direction, command.anchor ?? 'top-start')
  const width = Math.max(MIN_BOARD_ITEM_WIDTH, command.width)
  const adjustments = shapeAdjustments(context, [item.id])
  if (!command.anchor)
    adjustments.push({ command: context.command, kind: 'default-anchor', id: item.id, detail: `Kept the item's logical start edge and top fixed.` })
  if (width !== command.width)
    adjustments.push({
      command: context.command,
      kind: 'width-clamped',
      id: item.id,
      detail: `Clamped width ${command.width} to the minimum ${MIN_BOARD_ITEM_WIDTH}.`,
    })
  const intended = resizeItem(context.board, item.id, width, anchor, (value) => (value * shape.height) / shape.width)
  return settled(context, intended, context.shapes, [item.id], adjustments)
}

function arrangeSection(context: CommandContext, command: BoardCommandOf<'arrange'>): CommandResult {
  const section = resolveSection(context.board, command.section as NonNullable<typeof command.section>)
  const columns = command.columns ?? defaultGridColumns(section.items.length)
  const cells = section.items.map((id, index) => ({ id, row: Math.floor(index / columns), column: index % columns }))
  const intended = {
    ...context.board,
    sections: context.board.sections.map((entry) => (entry.id === section.id ? { ...entry, layout: 'auto' as const, cells } : entry)),
  }
  const adjustments = shapeAdjustments(context, section.items)
  if (command.columns === undefined)
    adjustments.push({ command: context.command, kind: 'default-columns', id: section.id, detail: `Used ${columns} grid columns.` })
  adjustments.push({ command: context.command, kind: 'default-gap', id: section.id, detail: `Used the board section gap ${SECTION_GAP}.` })
  if (section.layout === 'manual')
    adjustments.push({ command: context.command, kind: 'auto-layout', id: section.id, detail: `Changed section "${section.id}" to auto layout for its grid.` })
  return settled(context, intended, context.shapes, [section.id, ...section.items], adjustments)
}

function arrangeBoard(context: CommandContext, command: BoardCommandOf<'arrange'>): CommandResult {
  requireShapes(context.board, context.shapes)
  const intended = arrange(context.board, context.shapes, {
    layout: 'grid',
    gap: SECTION_GAP,
    columns: command.columns,
    sectionPadding: SECTION_PADDING + SECTION_TITLE_ROOM,
  })
  const adjustments: BoardEditAdjustment[] = []
  if (command.columns === undefined)
    adjustments.push({ command: context.command, kind: 'default-columns', id: 'board', detail: "Used the board grid's automatic column count." })
  adjustments.push({ command: context.command, kind: 'default-gap', id: 'board', detail: `Used the board gap ${SECTION_GAP}.` })
  return settled(
    context,
    intended,
    context.shapes,
    context.board.items.map((item) => item.id),
    adjustments,
  )
}

function arrangeCommand(context: CommandContext, command: BoardCommandOf<'arrange'>): CommandResult {
  return command.section ? arrangeSection(context, command) : arrangeBoard(context, command)
}

type Handler = (context: CommandContext, command: BoardCommand) => CommandResult
export const BOARD_COMMAND_HANDLERS: Record<BoardCommand['type'], Handler> = {
  'item-add': (context, command) => itemAdd(context, command as BoardCommandOf<'item-add'>),
  'item-remove': (context, command) => itemRemove(context, command as BoardCommandOf<'item-remove'>),
  'item-move': (context, command) => itemMove(context, command as BoardCommandOf<'item-move'>),
  'item-resize': (context, command) => itemResize(context, command as BoardCommandOf<'item-resize'>),
  arrange: (context, command) => arrangeCommand(context, command as BoardCommandOf<'arrange'>),
}
