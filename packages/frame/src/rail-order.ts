export interface RailOrderMove {
  id: string
  before: string | null
}

export function railOrderMoves(current: readonly string[], wanted: readonly string[]): RailOrderMove[] {
  const wantedIds = new Set(wanted)
  const order = current.filter((id) => wantedIds.has(id))
  const moves: RailOrderMove[] = []
  for (let index = wanted.length - 1; index >= 0; index--) {
    const id = wanted[index]
    if (id === undefined) continue
    const before = wanted[index + 1] ?? null
    const currentIndex = order.indexOf(id)
    const beforeIndex = before === null ? order.length : order.indexOf(before)
    if (currentIndex >= 0 && currentIndex === beforeIndex - 1) continue
    if (currentIndex >= 0) order.splice(currentIndex, 1)
    const insertionIndex = before === null ? order.length : order.indexOf(before)
    order.splice(insertionIndex, 0, id)
    moves.push({ id, before })
  }
  return moves
}
