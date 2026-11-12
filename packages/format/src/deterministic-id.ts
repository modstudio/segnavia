const BLOCK_ID = /(?:^|[\s<])data-segnavia-id\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g

function collectIds(value: unknown, taken: Set<string>, visited: WeakSet<object>): void {
  if (typeof value === 'string') {
    for (const match of value.matchAll(BLOCK_ID)) {
      const id = match[1] ?? match[2] ?? match[3]
      if (id !== undefined) taken.add(id)
    }
    return
  }
  if (typeof value !== 'object' || value === null || visited.has(value)) return
  visited.add(value)
  for (const [name, child] of Object.entries(value)) {
    if (name === 'id' && typeof child === 'string') taken.add(child)
    collectIds(child, taken, visited)
  }
}

export function deterministicNewId(input: unknown): () => string {
  if (typeof input !== 'object' || input === null || typeof (input as { id?: unknown }).id !== 'string' || !(input as { id: string }).id) {
    throw new Error("deterministicNewId needs the document's id to build ids from; give the document a non-empty id to clear this refusal")
  }
  const prefix = (input as { id: string }).id
  const taken = new Set<string>()
  collectIds(input, taken, new WeakSet())
  let next = 1
  return () => {
    let id = `${prefix}-${next++}`
    while (taken.has(id)) id = `${prefix}-${next++}`
    taken.add(id)
    return id
  }
}
