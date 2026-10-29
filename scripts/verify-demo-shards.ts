export type VerifyShard = Readonly<{ index: number; count: number }>

// Local macOS timings in seconds: player 20.5, player layout 13.3, pages 11.2,
// RTL 11.0, board 10.2, deck host 8.4, rail authoring 8.2, papers 6.5,
// headless 4.5, media 4.5, components 1.9, books 1.2, selection 0.5,
// bounded page and responsive 0.4, documents 0.2, and paper picker, thumbnail,
// image fit, and capture under 0.1.
// Round-robin assignment from this fixed list gives the common three shards
// about 34 seconds each. The verifier preserves the original execution order.
export const VERIFY_DEMO_SECTIONS_BY_DURATION = [
  'verifyPlayer',
  'verifyPlayerLayout',
  'verifyRtl',
  'verifyDeckHost',
  'verifyPages',
  'verifyBoard',
  'verifyMedia',
  'verifyPapers',
  'verifyRailAuthoring',
  'verifyBooks',
  'verifyComponents',
  'verifyCssSanitizer',
  'verifyHeadless',
  'verifyDocuments',
  'verifySelection',
  'verifyBoundedPage',
  'verifyResponsive',
  'verifyPaperPicker',
  'verifyThumbnail',
  'verifyImageFit',
  'verifyCapture',
  'verifySlots',
] as const

export function parseVerifyShard(value: string | undefined): VerifyShard | undefined {
  if (value === undefined) return undefined
  const match = /^(\d+)\/(\d+)$/.exec(value)
  const index = Number(match?.[1])
  const count = Number(match?.[2])
  // More shards than sections would leave a shard with nothing to run, which passes.
  const most = VERIFY_DEMO_SECTIONS_BY_DURATION.length
  if (!match || count < 1 || count > most || index < 1 || index > count) {
    throw new Error(`SEGNAVIA_VERIFY_SHARD must be an index/count pair with 1 <= index <= count <= ${most}; received ${value}`)
  }
  return { index, count }
}

// Shards select from the duration list, so a section missing from it would
// run in no shard at all.
export function unlistedSections(defined: readonly string[], listed: readonly string[]): Readonly<{ unlisted: string[]; stale: string[] }> {
  return {
    unlisted: defined.filter((name) => !listed.includes(name)),
    stale: listed.filter((name) => !defined.includes(name)),
  }
}

export function sectionsForShard(sectionNames: readonly string[], shard: VerifyShard | undefined): ReadonlySet<string> {
  if (shard === undefined) return new Set(sectionNames)
  return new Set(sectionNames.filter((_, position) => position % shard.count === shard.index - 1))
}
