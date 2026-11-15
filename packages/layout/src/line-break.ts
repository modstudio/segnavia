export interface Box {
  type: 'box'
  width: number
}

export interface Glue {
  type: 'glue'
  width: number
  stretch: number
  shrink: number
}

export interface Penalty {
  type: 'penalty'
  width: number
  penalty: number
  flagged?: boolean
}

type Item = Box | Glue | Penalty

interface Breakpoint {
  index: number
  penalty: number
  flagged: boolean
  forced: boolean
}

interface Node {
  breakpoint: Breakpoint
  previous?: Node
  line: number
  ratio: number
  demerits: number
  fitness: number
}

interface Options {
  minRatio?: number
  maxRatio?: number
  emergencyStretch?: number
  linePenalty?: number
  flaggedDemerits?: number
  fitnessDemerits?: number
}

type Settings = Required<Options>

interface Pass {
  hyphens: boolean
  settings: Settings
  enforceLimits: boolean
}

const CHUNK_ITEMS = 2_000
const INFINITE_BADNESS = 10_000

function breakpoints(items: readonly Item[]): Breakpoint[] {
  const points: Breakpoint[] = []
  for (let index = 0; index < items.length; index++) {
    const item = items[index]
    if (!item) continue
    if (item.type === 'glue' && items[index - 1]?.type === 'box') {
      points.push({ index, penalty: 0, flagged: false, forced: false })
    } else if (item.type === 'penalty' && item.penalty < Number.POSITIVE_INFINITY) {
      points.push({ index, penalty: item.penalty, flagged: item.flagged === true, forced: item.penalty === Number.NEGATIVE_INFINITY })
    }
  }
  const last = points.at(-1)
  if (!last?.forced || last.index < items.length - 1) {
    points.push({ index: items.length, penalty: Number.NEGATIVE_INFINITY, flagged: false, forced: true })
  }
  return points
}

function prefixes(items: readonly Item[]) {
  const width = [0]
  const stretch = [0]
  const shrink = [0]
  const forced = [0]
  for (const item of items) {
    width.push((width.at(-1) ?? 0) + (item.type === 'penalty' ? 0 : item.width))
    stretch.push((stretch.at(-1) ?? 0) + (item.type === 'glue' ? item.stretch : 0))
    shrink.push((shrink.at(-1) ?? 0) + (item.type === 'glue' ? item.shrink : 0))
    forced.push((forced.at(-1) ?? 0) + (item.type === 'penalty' && item.penalty === Number.NEGATIVE_INFINITY ? 1 : 0))
  }
  return { width, stretch, shrink, forced }
}

function lineStart(items: readonly Item[], previous: Breakpoint): number {
  let start = previous.index + 1
  while (true) {
    const item = items[start]
    if (item?.type !== 'glue' && (item?.type !== 'penalty' || item.penalty === Number.NEGATIVE_INFINITY)) return start
    start++
  }
}

function adjustment(
  items: readonly Item[],
  sums: ReturnType<typeof prefixes>,
  previous: Breakpoint,
  current: Breakpoint,
  target: number,
  emergencyStretch: number,
): { ratio: number; badness: number } {
  const start = lineStart(items, previous)
  const end = current.index
  const penaltyWidth = end < items.length && items[end]?.type === 'penalty' ? items[end].width : 0
  const natural = (sums.width[end] ?? 0) - (sums.width[start] ?? 0) + penaltyWidth
  const difference = target - natural
  if (difference === 0) return { ratio: 0, badness: 0 }
  if (difference > 0) {
    const stretch = (sums.stretch[end] ?? 0) - (sums.stretch[start] ?? 0) + emergencyStretch
    if (stretch > 0) return adjustmentForRatio(difference / stretch)
    return { ratio: Number.POSITIVE_INFINITY, badness: overflowBadness(difference, target) }
  }
  const shrink = (sums.shrink[end] ?? 0) - (sums.shrink[start] ?? 0)
  if (shrink > 0) return adjustmentForRatio(difference / shrink)
  return { ratio: Number.NEGATIVE_INFINITY, badness: overflowBadness(difference, target) }
}

function overflowBadness(difference: number, target: number): number {
  return INFINITE_BADNESS * (1 + Math.abs(difference) / Math.max(1, Math.abs(target)))
}

function fitnessClass(ratio: number): number {
  if (ratio < -0.5) return 0
  if (ratio <= 0.5) return 1
  if (ratio <= 1) return 2
  return 3
}

function adjustmentForRatio(ratio: number): { ratio: number; badness: number } {
  return { ratio, badness: 100 * Math.abs(ratio) ** 3 }
}

function lineDemerits(previous: Node, point: Breakpoint, ratio: number, adjustmentBadness: number, settings: Settings): number {
  const base = (settings.linePenalty + adjustmentBadness) ** 2
  const penalty = point.forced ? 0 : Math.sign(point.penalty) * point.penalty ** 2
  const flagged = previous.breakpoint.flagged && point.flagged ? settings.flaggedDemerits : 0
  const fitness = Math.abs(previous.fitness - fitnessClass(ratio)) > 1 ? settings.fitnessDemerits : 0
  return Math.max(0, base + penalty) + flagged + fitness
}

function hasSkippedForced(sums: ReturnType<typeof prefixes>, items: readonly Item[], previous: Breakpoint, current: Breakpoint): boolean {
  const start = Math.min(lineStart(items, previous), current.index)
  return (sums.forced[current.index] ?? 0) - (sums.forced[start] ?? 0) > 0
}

function candidateNode(
  items: readonly Item[],
  sums: ReturnType<typeof prefixes>,
  widths: readonly number[],
  widthOffset: number,
  settings: Settings,
  enforceLimits: boolean,
  previous: Node,
  point: Breakpoint,
): Node | undefined {
  if (hasSkippedForced(sums, items, previous.breakpoint, point)) return undefined
  const widthIndex = widthOffset + previous.line
  const target = widths[widthIndex] ?? widths.at(-1) ?? 0
  const measured = adjustment(items, sums, previous.breakpoint, point, target, settings.emergencyStretch)
  if (enforceLimits && (measured.ratio < settings.minRatio || measured.ratio > settings.maxRatio)) return undefined
  const fitness = fitnessClass(measured.ratio)
  return {
    breakpoint: point,
    previous,
    line: previous.line + 1,
    ratio: measured.ratio,
    demerits: previous.demerits + lineDemerits(previous, point, measured.ratio, measured.badness, settings),
    fitness,
  }
}

function candidatesAtPoint(
  items: readonly Item[],
  sums: ReturnType<typeof prefixes>,
  widths: readonly number[],
  widthOffset: number,
  settings: Settings,
  enforceLimits: boolean,
  singleMeasure: boolean,
  nodes: readonly Node[],
  point: Breakpoint,
): Node[] {
  const best = new Map<string, Node>()
  for (const previous of nodes) {
    const candidate = candidateNode(items, sums, widths, widthOffset, settings, enforceLimits, previous, point)
    if (!candidate) continue
    const lineKey = singleMeasure ? '' : candidate.line
    const key = `${lineKey}:${candidate.fitness}:${point.flagged ? 1 : 0}`
    const held = best.get(key)
    if (!held || candidate.demerits < held.demerits) best.set(key, candidate)
  }
  return [...best.values()]
}

function solve(
  items: readonly Item[],
  widths: readonly number[],
  widthOffset: number,
  pass: Pass,
  initial: { flagged: boolean; fitness: number },
): Node | undefined {
  const sums = prefixes(items)
  const points = breakpoints(items)
  const singleMeasure = widths.length === 1
  const terminalIndex = points.at(-1)?.index
  const startPoint: Breakpoint = { index: -1, penalty: 0, flagged: initial.flagged, forced: true }
  const nodes: Node[] = [{ breakpoint: startPoint, line: 0, ratio: 0, demerits: 0, fitness: initial.fitness }]
  let endings: Node[] = []

  for (const point of points) {
    if (point.flagged && !pass.hyphens && !point.forced) continue
    const atPoint = candidatesAtPoint(items, sums, widths, widthOffset, pass.settings, pass.enforceLimits, singleMeasure, nodes, point)
    nodes.push(...atPoint)
    if (point.index === terminalIndex) endings = atPoint
  }
  return endings.reduce<Node | undefined>((best, node) => (!best || node.demerits < best.demerits ? node : best), undefined)
}

function chunkEnds(items: readonly Item[]): number[] {
  if (items.length <= CHUNK_ITEMS) return [items.length - 1]
  const candidates = breakpoints(items).map((point) => point.index)
  const ends: number[] = []
  let start = 0
  while (items.length - start > CHUNK_ITEMS) {
    const limit = start + CHUNK_ITEMS
    const before = candidates.filter((index) => index > start && index <= limit).at(-1)
    const after = candidates.find((index) => index > limit)
    const end = Math.min(before ?? after ?? items.length - 1, items.length - 1)
    ends.push(end)
    start = end + 1
  }
  if (start < items.length) ends.push(items.length - 1)
  return ends
}

function chosenNodes(end: Node): Node[] {
  const lines: Node[] = []
  let node: Node | undefined = end
  while (node.previous) {
    lines.push(node)
    node = node.previous
  }
  return lines.reverse()
}

/**
 * Chooses total-fit line breaks. Paragraphs over 2,000 items are independently
 * optimized in chunks ending at the last available breakpoint within the cap.
 * When no ratio-limited pass succeeds, a least-bad pass returns and flags the
 * best set without ratio limits.
 */
export function breakLines(
  items: readonly Item[],
  widths: readonly number[],
  options: Options = {},
): { breaks: number[]; ratios: number[]; violations: boolean[] } {
  if (items.length === 0) return { breaks: [], ratios: [], violations: [] }
  const settings: Settings = {
    minRatio: options.minRatio ?? -1,
    maxRatio: options.maxRatio ?? 3,
    emergencyStretch: options.emergencyStretch ?? 0,
    linePenalty: options.linePenalty ?? 10,
    flaggedDemerits: options.flaggedDemerits ?? 100,
    fitnessDemerits: options.fitnessDemerits ?? 3_000,
  }
  const base: Settings = { ...settings, emergencyStretch: 0 }
  const noHyphens: Pass = { hyphens: false, settings: base, enforceLimits: true }
  const hyphens: Pass = { hyphens: true, settings: base, enforceLimits: true }
  const emergency: Pass = { hyphens: true, settings, enforceLimits: true }
  const leastBad: Pass = { hyphens: true, settings, enforceLimits: false }
  const passes = [noHyphens, hyphens, emergency, leastBad]
  const breaks: number[] = []
  const ratios: number[] = []
  const violations: boolean[] = []
  let itemOffset = 0
  let widthOffset = 0
  let prior = { flagged: false, fitness: 1 }

  for (const chunkEnd of chunkEnds(items)) {
    const chunk = items.slice(itemOffset, chunkEnd + 1)
    if (chunkEnd < items.length - 1) {
      const boundary = chunk.at(-1)
      chunk[chunk.length - 1] = penaltyBoundary(boundary)
    }
    const end = passes.map((pass) => solve(chunk, widths, widthOffset, pass, prior)).find(Boolean)
    if (!end) break
    const lines = chosenNodes(end)
    const sums = prefixes(chunk)
    for (const [index, line] of lines.entries()) {
      const target = widths[widthOffset + index] ?? widths.at(-1) ?? 0
      const measured = adjustment(chunk, sums, line.previous?.breakpoint ?? { index: -1, penalty: 0, flagged: false, forced: true }, line.breakpoint, target, 0)
      breaks.push(itemOffset + line.breakpoint.index)
      ratios.push(measured.ratio)
      violations.push(measured.ratio < base.minRatio || measured.ratio > base.maxRatio)
    }
    widthOffset += lines.length
    const last = lines.at(-1)
    if (last) prior = { flagged: last.breakpoint.flagged, fitness: last.fitness }
    itemOffset = chunkEnd + 1
  }
  return { breaks, ratios, violations }
}

function penaltyBoundary(item: Item | undefined): Penalty {
  return {
    type: 'penalty',
    width: item?.type === 'penalty' ? item.width : 0,
    penalty: Number.NEGATIVE_INFINITY,
    flagged: item?.type === 'penalty' && item.flagged,
  }
}

/** Embeds the total-fit breaker in an author-document frame. */
export function breakLinesScript(): string {
  return `var CHUNK_ITEMS=${CHUNK_ITEMS};var INFINITE_BADNESS=${INFINITE_BADNESS};
${breakpoints.toString()}
${prefixes.toString()}
${lineStart.toString()}
${adjustment.toString()}
${overflowBadness.toString()}
${fitnessClass.toString()}
${adjustmentForRatio.toString()}
${lineDemerits.toString()}
${hasSkippedForced.toString()}
${candidateNode.toString()}
${candidatesAtPoint.toString()}
${solve.toString()}
${chunkEnds.toString()}
${chosenNodes.toString()}
${penaltyBoundary.toString()}
${breakLines.toString()}`
}
