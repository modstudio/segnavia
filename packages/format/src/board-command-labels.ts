import type { Board, BoardLabel } from './board.ts'
import { type BoardCommandHandler, type CommandContext, type CommandResult, placementAdjustments, settled } from './board-command-items.ts'
import { BoardCommandRefusal, resolveLabel } from './board-command-resolvers.ts'
import { placeBoardEntityTarget } from './board-command-targets.ts'
import type { BoardCommand, BoardCommandOf } from './board-commands.ts'
import type { BoardEditAdjustment } from './board-edit-result.ts'
import { labelShape } from './board-shapes.ts'

function labelIdentity(context: CommandContext, supplied: string | undefined): { id: string; generated: boolean } {
  const generated = supplied === undefined
  const id = supplied ?? context.options.newId?.()
  if (!id) throw new BoardCommandRefusal('the new label has no id', 'supply an id or a newId option')
  if ([...context.board.items, ...context.board.labels, ...context.board.sections].some((entry) => entry.id === id))
    throw new BoardCommandRefusal(`id "${id}" already exists`, 'supply a unique id')
  return { id, generated }
}

function sizedLabel(
  context: CommandContext,
  label: BoardLabel,
): { label: BoardLabel; shape: { width: number; height: number }; adjustment: BoardEditAdjustment } {
  const result = labelShape(label, context.options.measureLabel)
  if (result.source === 'measured')
    return {
      label: { ...label, size: result.shape },
      shape: result.shape,
      adjustment: { command: context.command, kind: 'measured-label', id: label.id, detail: `Measured label "${label.id}" from its text.` },
    }
  return {
    label,
    shape: result.shape,
    adjustment: { command: context.command, kind: 'estimated-shape', id: label.id, detail: `Used an estimated shape for label "${label.id}".` },
  }
}

function labelAdd(context: CommandContext, command: BoardCommandOf<'label-add'>): CommandResult {
  const identity = labelIdentity(context, command.id)
  const sized = sizedLabel(context, { id: identity.id, text: command.text, x: 0, y: 0 })
  const shapes = { ...context.shapes, labels: { ...context.shapes.labels, [identity.id]: sized.shape } }
  let intended: Board = { ...context.board, labels: [...context.board.labels, sized.label] }
  const target = command.target ?? { free: true as const }
  const placement = placeBoardEntityTarget(intended, shapes, { kind: 'label', id: identity.id }, target)
  intended = placement.board
  const adjustments: BoardEditAdjustment[] = [sized.adjustment, ...placementAdjustments(context, placement)]
  if (identity.generated)
    adjustments.push({ command: context.command, kind: 'generated-id', id: identity.id, detail: `Generated id "${identity.id}" with options.newId.` })
  if (!command.target)
    adjustments.push({ command: context.command, kind: 'default-target', id: identity.id, detail: 'Placed the label at the first free spot.' })
  return settled(context, intended, shapes, [identity.id], adjustments)
}

function labelRemove(context: CommandContext, command: BoardCommandOf<'label-remove'>): CommandResult {
  const labels = command.labels.map((ref) => resolveLabel(context.board, ref))
  const duplicate = labels.find((label, index) => labels.findIndex((entry) => entry.id === label.id) !== index)
  if (duplicate) throw new BoardCommandRefusal(`label "${duplicate.id}" is named more than once`, 'name every label at most once')
  const removed = new Set(labels.map((label) => label.id))
  const intended = { ...context.board, labels: context.board.labels.filter((label) => !removed.has(label.id)) }
  const shapes = { ...context.shapes, labels: Object.fromEntries(Object.entries(context.shapes.labels).filter(([id]) => !removed.has(id))) }
  return settled(context, intended, shapes, [...removed], [])
}

function labelSet(context: CommandContext, command: BoardCommandOf<'label-set'>): CommandResult {
  const current = resolveLabel(context.board, command.label)
  const textChanged = command.text !== undefined && command.text !== current.text
  const { size: _storedSize, ...withoutSize } = current
  let label: BoardLabel = textChanged ? { ...withoutSize, text: command.text as string } : current
  let shapes = context.shapes
  const adjustments: BoardEditAdjustment[] = []
  if (textChanged) {
    const sized = sizedLabel(context, label)
    label = sized.label
    shapes = { ...shapes, labels: { ...shapes.labels, [label.id]: sized.shape } }
    adjustments.push(sized.adjustment)
  }
  let intended: Board = { ...context.board, labels: context.board.labels.map((entry) => (entry.id === label.id ? label : entry)) }
  if (command.target) {
    const placement = placeBoardEntityTarget(intended, shapes, { kind: 'label', id: label.id }, command.target)
    intended = placement.board
    adjustments.push(...placementAdjustments(context, placement))
  }
  return settled(context, intended, shapes, [label.id], adjustments)
}

export const LABEL_COMMAND_HANDLERS: Record<Extract<BoardCommand['type'], 'label-add' | 'label-remove' | 'label-set'>, BoardCommandHandler> = {
  'label-add': (context, command) => labelAdd(context, command as BoardCommandOf<'label-add'>),
  'label-remove': (context, command) => labelRemove(context, command as BoardCommandOf<'label-remove'>),
  'label-set': (context, command) => labelSet(context, command as BoardCommandOf<'label-set'>),
}
