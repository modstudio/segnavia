import type { Board, BoardSection } from './board.ts'
import {
  type BoardCommandHandler,
  type CommandContext,
  type CommandResult,
  newEntityId,
  placementAdjustments,
  placementEstimatedLabels,
  settled,
  shapeAdjustments,
} from './board-command-core.ts'
import { BoardCommandRefusal, requireItemShape, resolveItems, resolveSection } from './board-command-resolvers.ts'
import { placeBoardEntityTarget } from './board-command-targets.ts'
import type { BoardCommand, BoardCommandOf } from './board-commands.ts'
import { removeItems } from './board-edit.ts'
import type { BoardEditAdjustment } from './board-edit-result.ts'
import { defaultGridColumns, itemRectangle } from './board-geometry.ts'
import { cellsInOrder, deriveSectionCells, layoutSection, removeFromGrid } from './board-section-grid.ts'
import { fitSection, SECTION_MIN_SIZE } from './board-sections.ts'

function requireUniqueTitle(board: Board, title: string, except?: string): void {
  const duplicate = board.sections.find((section) => section.id !== except && section.title === title)
  if (duplicate) throw new BoardCommandRefusal(`section title "${title}" already belongs to section "${duplicate.id}"`, 'pick a title no other section has')
}

function memberStart(board: Board, context: CommandContext, ids: readonly string[]) {
  const boxes = ids.map((id) => {
    const item = board.items.find((entry) => entry.id === id)
    if (!item) throw new BoardCommandRefusal(`item id "${id}" does not exist`, 'pass the id or unique address of an existing item')
    return itemRectangle(item, context.shapes)
  })
  return {
    x: board.direction === 'rtl' ? Math.max(...boxes.map((box) => box.x + box.width)) : Math.min(...boxes.map((box) => box.x)),
    y: Math.min(...boxes.map((box) => box.y)),
  }
}

function sectionAdd(context: CommandContext, command: BoardCommandOf<'section-add'>): CommandResult {
  requireUniqueTitle(context.board, command.title)
  const identity = newEntityId(context, command.id, 'section')
  const members = resolveItems(context.board, command.items ?? [])
  const ids = members.map((item) => item.id)
  for (const id of ids) requireItemShape(context.shapes, id)
  const layout = command.layout ?? 'auto'
  const adjustments: BoardEditAdjustment[] = []
  if (identity.adjustment) adjustments.push(identity.adjustment)
  if (command.layout === undefined)
    adjustments.push({ command: context.command, kind: 'default-layout', id: identity.id, detail: 'Used auto layout for the new section.' })
  for (const old of context.board.sections)
    for (const id of ids)
      if (old.items.includes(id))
        adjustments.push({
          command: context.command,
          kind: 'membership-moved',
          id,
          detail: `Moved item "${id}" out of section "${old.id}" into section "${identity.id}".`,
        })
  const removed = removeFromGrid(context.board, context.shapes, ids)
  const start = ids.length ? memberStart(removed, context, ids) : { x: 0, y: 0 }
  const columns = defaultGridColumns(ids.length)
  const section: BoardSection = {
    id: identity.id,
    title: command.title,
    layout,
    items: ids,
    rectangle: { x: boardStartX(context.board.direction, start.x, SECTION_MIN_SIZE.width), y: start.y, ...SECTION_MIN_SIZE },
    ...(layout === 'auto' ? { cells: cellsInOrder(ids, columns) } : {}),
  }
  let intended: Board = { ...removed, sections: [...removed.sections, section] }
  intended = layout === 'auto' ? layoutSection(intended, context.shapes, identity.id) : fitSection(intended, context.shapes, identity.id)
  if (ids.length > 0 && !command.target && context.board.direction === 'rtl') {
    const laidOut = intended.sections.find((entry) => entry.id === identity.id)
    if (laidOut)
      intended = placeBoardEntityTarget(
        intended,
        context.shapes,
        { kind: 'section', id: identity.id },
        { at: { x: start.x - laidOut.rectangle.width, y: start.y } },
      ).board
  }
  if (command.target) {
    const placement = placeBoardEntityTarget(intended, context.shapes, { kind: 'section', id: identity.id }, command.target)
    intended = placement.board
    adjustments.push(...placementAdjustments(context, placement))
    return settled(
      context,
      intended,
      context.shapes,
      [identity.id, ...ids],
      [...shapeAdjustments(context, ids), ...adjustments],
      placementEstimatedLabels(placement),
    )
  } else if (ids.length === 0) {
    const placement = placeBoardEntityTarget(intended, context.shapes, { kind: 'section', id: identity.id }, { free: true })
    intended = placement.board
    adjustments.push({ command: context.command, kind: 'default-target', id: identity.id, detail: 'Placed the empty section at the first free spot.' })
  }
  return settled(context, intended, context.shapes, [identity.id, ...ids], [...shapeAdjustments(context, ids), ...adjustments])
}

function boardStartX(direction: Board['direction'], start: number, width: number): number {
  return direction === 'rtl' ? start - width : start
}

function sectionRemove(context: CommandContext, command: BoardCommandOf<'section-remove'>): CommandResult {
  const section = resolveSection(context.board, command.section)
  let intended: Board = { ...context.board, sections: context.board.sections.filter((entry) => entry.id !== section.id) }
  if (command.members === 'remove') intended = removeItems(intended, section.items)
  return settled(context, intended, context.shapes, [section.id, ...section.items], [])
}

function memberMismatch(section: BoardSection, ids: readonly string[]): { missing: string[]; extra: string[] } {
  const expected = new Set(section.items)
  const actual = new Set(ids)
  return { missing: section.items.filter((id) => !actual.has(id)), extra: ids.filter((id) => !expected.has(id)) }
}

function withSectionLayout(
  context: CommandContext,
  section: BoardSection,
  nextSection: BoardSection,
  requested: readonly string[] | undefined,
  layout: BoardCommandOf<'section-set'>['layout'],
  adjustments: BoardEditAdjustment[],
): BoardSection {
  const nextLayout = layout ?? section.layout ?? 'auto'
  if (nextLayout === 'manual') {
    const { cells: _cells, ...withoutCells } = nextSection
    return withoutCells
  }
  if (section.layout === 'manual' && layout === 'auto') {
    const staged = { ...context.board, sections: context.board.sections.map((entry) => (entry.id === section.id ? nextSection : entry)) }
    adjustments.push({ command: context.command, kind: 'auto-layout', id: section.id, detail: `Changed section "${section.id}" to auto layout.` })
    return { ...nextSection, cells: deriveSectionCells(staged, context.shapes, section.id) }
  }
  if (requested) {
    const sourceCells = section.cells ?? deriveSectionCells(context.board, context.shapes, section.id)
    const columns = Math.max(1, ...sourceCells.map((cell) => cell.column + 1))
    return { ...nextSection, cells: cellsInOrder(requested, columns) }
  }
  if (layout === 'auto' && !nextSection.cells) {
    const staged = { ...context.board, sections: context.board.sections.map((entry) => (entry.id === section.id ? nextSection : entry)) }
    return { ...nextSection, cells: deriveSectionCells(staged, context.shapes, section.id) }
  }
  return nextSection
}

function sectionSet(context: CommandContext, command: BoardCommandOf<'section-set'>): CommandResult {
  const section = resolveSection(context.board, command.section)
  if (command.title !== undefined) requireUniqueTitle(context.board, command.title, section.id)
  const requested = command.items ? resolveItems(context.board, command.items).map((item) => item.id) : undefined
  if (requested) {
    const mismatch = memberMismatch(section, requested)
    if (mismatch.missing.length || mismatch.extra.length)
      throw new BoardCommandRefusal(
        `section "${section.id}" member order is missing [${mismatch.missing.join(', ')}] and has extra [${mismatch.extra.join(', ')}]`,
        `pass every current member of section "${section.id}" exactly once and no other items`,
      )
  }
  const adjustments: BoardEditAdjustment[] = []
  const changedSection: BoardSection = {
    ...section,
    ...(command.title !== undefined ? { title: command.title } : {}),
    ...(requested ? { items: requested } : {}),
    ...(command.layout !== undefined ? { layout: command.layout } : {}),
  }
  const wasManual = section.layout === 'manual'
  const nextLayout = command.layout ?? section.layout ?? 'auto'
  const nextSection = withSectionLayout(context, section, changedSection, requested, command.layout, adjustments)
  let intended: Board = { ...context.board, sections: context.board.sections.map((entry) => (entry.id === section.id ? nextSection : entry)) }
  if (nextLayout !== 'manual' && (requested || (wasManual && command.layout === 'auto'))) intended = layoutSection(intended, context.shapes, section.id)
  return settled(context, intended, context.shapes, [section.id, ...section.items], [...shapeAdjustments(context, section.items), ...adjustments])
}

export const SECTION_COMMAND_HANDLERS: Record<Extract<BoardCommand['type'], 'section-add' | 'section-remove' | 'section-set'>, BoardCommandHandler> = {
  'section-add': (context, command) => sectionAdd(context, command as BoardCommandOf<'section-add'>),
  'section-remove': (context, command) => sectionRemove(context, command as BoardCommandOf<'section-remove'>),
  'section-set': (context, command) => sectionSet(context, command as BoardCommandOf<'section-set'>),
}
