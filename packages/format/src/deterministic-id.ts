// Reads quoted and unquoted HTML id values without decoding entities. An encoded
// collision is left for the document's existing duplicate-id refusal to report.
const HTML_ID = /(?:^|[\s<])(?:data-segnavia-id|id)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi

function collectIds(value: unknown, taken: Set<string>, visited: WeakSet<object>): void {
  if (typeof value === 'string') {
    for (const match of value.matchAll(HTML_ID)) {
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
  const rootId = typeof input === 'object' && input !== null ? (input as { id?: unknown }).id : undefined
  if (typeof rootId !== 'string' || !rootId) {
    throw new Error("deterministicNewId needs the document's id to build ids from; give the document a non-empty id to clear this refusal")
  }
  const taken = new Set<string>()
  collectIds(input, taken, new WeakSet())
  let next = 1
  // The captured ids are a snapshot, so one helper belongs to one input.
  return () => {
    let id = `${rootId}-${next++}`
    while (taken.has(id)) id = `${rootId}-${next++}`
    taken.add(id)
    return id
  }
}
