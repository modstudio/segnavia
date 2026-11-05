import type { Board, BoardSection } from './board.ts'
import { type BoardCommandHandler, type CommandContext, type CommandResult, placementAdjustments, settled, shapeAdjustments } from './board-command-items.ts'
import { BoardCommandRefusal, requireItemShape, resolveItems, resolveSection } from './board-command-resolvers.ts'
import { placeBoardEntityTarget } from './board-command-targets.ts'
import type { BoardCommand, BoardCommandOf } from './board-commands.ts'
import { removeItems } from './board-edit.ts'
import type { BoardEditAdjustment } from './board-edit-result.ts'
import { defaultGridColumns, itemRectangle } from './board-geometry.ts'
import { deriveSectionCells, layoutSection, removeFromGrid } from './board-section-grid.ts'
import { fitSection, SECTION_MIN_SIZE } from './board-sections.ts'

function uniqueId(context: CommandContext, supplied: string | undefined, description: string): { id: string; generated: boolean } {
  const generated = supplied === undefined
  const id = supplied ?? context.options.newId?.()
  if (!id) throw new BoardCommandRefusal(`the new ${description} has no id`, 'supply an id or a newId option')
  if ([...context.board.items, ...context.board.labels, ...context.board.sections].some((entry) => entry.id === id))
    throw new BoardCommandRefusal(`id "${id}" already exists`, 'supply a unique id')
  return { id, generated }
}

function requireUniqueTitle(board: Board, title: string, except?: string): void {
  const duplicate = board.sections.find((section) => section.id !== except && section.title === title)
  if (duplicate) throw new BoardCommandRefusal(`section title "${title}" already belongs to section "${duplicate.id}"`, 'pick a title no other section has')
}

function memberOrigin(board: Board, context: CommandContext, ids: readonly string[]) {
  const boxes = ids.map((id) => {
    const item = board.items.find((entry) => entry.id === id)
    if (!item) throw new BoardCommandRefusal(`item id "${id}" does not exist`, 'pass the id or unique address of an existing item')
    return itemRectangle(item, context.shapes)
  })
  return { x: Math.min(...boxes.map((box) => box.x)), y: Math.min(...boxes.map((box) => box.y)) }
}

function sectionAdd(context: CommandContext, command: BoardCommandOf<'section-add'>): CommandResult {
  requireUniqueTitle(context.board, command.title)
  const identity = uniqueId(context, command.id, 'section')
  const members = resolveItems(context.board, command.items ?? [])
  const ids = members.map((item) => item.id)
  for (const id of ids) requireItemShape(context.shapes, id)
  const layout = command.layout ?? 'auto'
  const adjustments: BoardEditAdjustment[] = []
  if (identity.generated)
    adjustments.push({ command: context.command, kind: 'generated-id', id: identity.id, detail: `Generated id "${identity.id}" with options.newId.` })
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
  const origin = ids.length ? memberOrigin(removed, context, ids) : { x: 0, y: 0 }
  const columns = defaultGridColumns(ids.length)
  const section: BoardSection = {
    id: identity.id,
    title: command.title,
    layout,
    items: ids,
    rectangle: { ...origin, ...SECTION_MIN_SIZE },
    ...(layout === 'auto' ? { cells: ids.map((id, index) => ({ id, row: Math.floor(index / columns), column: index % columns })) } : {}),
  }
  let intended: Board = { ...removed, sections: [...removed.sections, section] }
  intended = layout === 'auto' ? layoutSection(intended, context.shapes, identity.id) : fitSection(intended, context.shapes, identity.id)
  if (command.target) {
    const placement = placeBoardEntityTarget(intended, context.shapes, { kind: 'section', id: identity.id }, command.target)
    intended = placement.board
    adjustments.push(...placementAdjustments(context, placement))
  } else if (ids.length === 0) {
    const placement = placeBoardEntityTarget(intended, context.shapes, { kind: 'section', id: identity.id }, { free: true })
    intended = placement.board
    adjustments.push({ command: context.command, kind: 'default-target', id: identity.id, detail: 'Placed the empty section at the first free spot.' })
  }
  return settled(context, intended, context.shapes, [identity.id, ...ids], [...shapeAdjustments(context, ids), ...adjustments])
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
  const nextLayout = command.layout ?? section.layout ?? 'auto'
  const adjustments: BoardEditAdjustment[] = []
  let nextSection: BoardSection = {
    ...section,
    ...(command.title !== undefined ? { title: command.title } : {}),
    ...(requested ? { items: requested } : {}),
    layout: nextLayout,
  }
  const wasManual = section.layout === 'manual'
  if (nextLayout === 'manual') delete nextSection.cells
  else if (wasManual && command.layout === 'auto') {
    const staged = { ...context.board, sections: context.board.sections.map((entry) => (entry.id === section.id ? nextSection : entry)) }
    nextSection = { ...nextSection, cells: deriveSectionCells(staged, context.shapes, section.id) }
    adjustments.push({ command: context.command, kind: 'auto-layout', id: section.id, detail: `Changed section "${section.id}" to auto layout.` })
  } else if (requested) {
    const columns = Math.max(1, ...(section.cells ?? []).map((cell) => cell.column + 1))
    nextSection = { ...nextSection, cells: requested.map((id, index) => ({ id, row: Math.floor(index / columns), column: index % columns })) }
  }
  let intended: Board = { ...context.board, sections: context.board.sections.map((entry) => (entry.id === section.id ? nextSection : entry)) }
  if (nextLayout !== 'manual' && (requested || (wasManual && command.layout === 'auto'))) intended = layoutSection(intended, context.shapes, section.id)
  return settled(context, intended, context.shapes, [section.id, ...section.items], [...shapeAdjustments(context, section.items), ...adjustments])
}

export const SECTION_COMMAND_HANDLERS: Record<Extract<BoardCommand['type'], 'section-add' | 'section-remove' | 'section-set'>, BoardCommandHandler> = {
  'section-add': (context, command) => sectionAdd(context, command as BoardCommandOf<'section-add'>),
  'section-remove': (context, command) => sectionRemove(context, command as BoardCommandOf<'section-remove'>),
  'section-set': (context, command) => sectionSet(context, command as BoardCommandOf<'section-set'>),
}
