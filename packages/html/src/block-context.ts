export const BLOCK_ELEMENTS = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'figure', 'tr'] as const

export type BlockKind = (typeof BLOCK_ELEMENTS)[number]

interface BlockContext {
  parents: readonly string[] | null
  children: 'ordinary' | 'none'
}

export const BLOCK_CONTEXT: Readonly<Record<BlockKind, BlockContext>> = {
  p: { parents: null, children: 'none' },
  h1: { parents: null, children: 'none' },
  h2: { parents: null, children: 'none' },
  h3: { parents: null, children: 'none' },
  h4: { parents: null, children: 'none' },
  h5: { parents: null, children: 'none' },
  h6: { parents: null, children: 'none' },
  li: { parents: ['ul', 'ol'], children: 'ordinary' },
  figure: { parents: null, children: 'ordinary' },
  tr: { parents: ['table', 'thead', 'tbody', 'tfoot'], children: 'none' },
}

export const BLOCK_KINDS: ReadonlySet<string> = new Set(BLOCK_ELEMENTS)

const SPECIAL_PARENTS = new Set(Object.values(BLOCK_CONTEXT).flatMap(({ parents }) => parents ?? []))

function accepted(kind: BlockKind): string {
  const parents = BLOCK_CONTEXT[kind].parents
  return parents === null ? 'any parent except ul, ol, table, thead, tbody, or tfoot' : parents.join(' or ')
}

export function blockContextAllowed(kind: BlockKind, parent: string): boolean {
  const parents = BLOCK_CONTEXT[kind].parents
  const childAllowed = parents === null ? !SPECIAL_PARENTS.has(parent) : parents.includes(parent)
  const parentContext = BLOCK_CONTEXT[parent as BlockKind]
  return childAllowed && parentContext?.children !== 'none'
}

export function requireBlockContext(kind: BlockKind, parent: string): void {
  if (!blockContextAllowed(kind, parent)) {
    const parentRule = BLOCK_CONTEXT[parent as BlockKind]?.children === 'none' ? `; parent "${parent}" accepts no block children` : ''
    throw new Error(`block kind "${kind}" cannot stand in parent "${parent}"${parentRule}; place it directly in ${accepted(kind)} to clear this refusal`)
  }
}
