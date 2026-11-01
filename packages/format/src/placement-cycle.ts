import { PlacementRefusedError } from './placement-refusal.ts'

export type PlacementGraph = Readonly<Record<string, readonly string[]>>

export function findPlacementCycle(graph: PlacementGraph): string[] | undefined {
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const path: string[] = []
  const visit = (address: string): string[] | undefined => {
    if (visiting.has(address)) return [...path.slice(path.indexOf(address)), address]
    if (visited.has(address)) return undefined
    visiting.add(address)
    path.push(address)
    for (const child of graph[address] ?? []) {
      const cycle = visit(child)
      if (cycle) return cycle
    }
    path.pop()
    visiting.delete(address)
    visited.add(address)
    return undefined
  }
  for (const address of Object.keys(graph)) {
    const cycle = visit(address)
    if (cycle) return cycle
  }
  return undefined
}

export function checkPlacementCycles(graph: PlacementGraph): void {
  const cycle = findPlacementCycle(graph)
  if (cycle) {
    throw new PlacementRefusedError(
      `address could not be accepted because the placement chain ${cycle.join(' → ')} is a cycle; remove any one placement in the chain to clear this refusal`,
    )
  }
}
