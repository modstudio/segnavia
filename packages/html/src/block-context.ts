import type { BLOCK_ELEMENTS } from './document.ts'

export type BlockKind = (typeof BLOCK_ELEMENTS)[number]

export const BLOCK_CONTEXT: Readonly<Record<BlockKind, readonly string[] | null>> = {
  p: null,
  h1: null,
  h2: null,
  h3: null,
  h4: null,
  h5: null,
  h6: null,
  li: ['ul', 'ol'],
  figure: null,
  tr: ['table', 'thead', 'tbody', 'tfoot'],
}

const SPECIAL_PARENTS = new Set(['ul', 'ol', 'table', 'thead', 'tbody', 'tfoot'])

function accepted(kind: BlockKind): string {
  const parents = BLOCK_CONTEXT[kind]
  return parents === null ? 'any parent except ul, ol, table, thead, tbody, or tfoot' : parents.join(' or ')
}

export function blockContextAllowed(kind: BlockKind, parent: string): boolean {
  const parents = BLOCK_CONTEXT[kind]
  return parents === null ? !SPECIAL_PARENTS.has(parent) : parents.includes(parent)
}

export function requireBlockContext(kind: BlockKind, parent: string): void {
  if (!blockContextAllowed(kind, parent)) {
    throw new Error(`block kind "${kind}" cannot stand in parent "${parent}"; place it directly in ${accepted(kind)} to clear this refusal`)
  }
}
