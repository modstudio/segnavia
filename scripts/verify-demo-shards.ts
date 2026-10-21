export type VerifyShard = Readonly<{ index: number; count: number }>

export function parseVerifyShard(value: string | undefined): VerifyShard | undefined {
  if (value === undefined) return undefined
  const match = /^(\d+)\/(\d+)$/.exec(value)
  const index = Number(match?.[1])
  const count = Number(match?.[2])
  if (!match || count < 1 || index < 1 || index > count) {
    throw new Error(`SEGNAVIA_VERIFY_SHARD must be an index/count pair with 1 <= index <= count; received ${value}`)
  }
  return { index, count }
}

export function sectionsForShard(sectionNames: readonly string[], shard: VerifyShard | undefined): ReadonlySet<string> {
  if (shard === undefined) return new Set(sectionNames)
  return new Set(sectionNames.filter((_, position) => position % shard.count === shard.index - 1))
}
