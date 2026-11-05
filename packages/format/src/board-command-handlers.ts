import { type BoardCommandHandler, ITEM_COMMAND_HANDLERS } from './board-command-items.ts'
import { LABEL_COMMAND_HANDLERS } from './board-command-labels.ts'
import { PROPERTY_COMMAND_HANDLERS } from './board-command-properties.ts'
import { SECTION_COMMAND_HANDLERS } from './board-command-sections.ts'
import type { BoardCommand } from './board-commands.ts'

export const BOARD_COMMAND_HANDLERS: Record<BoardCommand['type'], BoardCommandHandler> = {
  ...ITEM_COMMAND_HANDLERS,
  ...SECTION_COMMAND_HANDLERS,
  ...LABEL_COMMAND_HANDLERS,
  ...PROPERTY_COMMAND_HANDLERS,
}
