import { boundComposeProgress, type ComposeProgress } from '@segnavia/format'
import { embedFunction } from '@segnavia/html'

export const COMPOSE_PROGRESS_YIELD_MS = 50
export const COMPOSE_PROGRESS_ATTRIBUTE = 'data-segnavia-compose-progress'

export interface ProgressYieldFacts {
  dressedSinceYield: number
  sinceYieldMs: number
  last: boolean
}

export function decideProgressYield(facts: ProgressYieldFacts): boolean {
  return facts.last || (facts.dressedSinceYield > 0 && facts.sinceYieldMs >= COMPOSE_PROGRESS_YIELD_MS)
}

export function reduceProgressHighWater(highWater: number, progress: ComposeProgress): ComposeProgress | undefined {
  if (progress.pages <= highWater) return undefined
  return progress
}

export function progressMacrotask(): Promise<void> {
  const yielding = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler?.yield
  if (yielding) return yielding.call((globalThis as { scheduler?: unknown }).scheduler)
  return new Promise((resolve) => {
    const channel = new MessageChannel()
    channel.port1.onmessage = () => {
      channel.port1.close()
      channel.port2.close()
      resolve()
    }
    channel.port2.postMessage(undefined)
  })
}

export async function dressPlanPages<T>(
  plan: { pages: T[] },
  only: number | null | undefined,
  report: (progress: ComposeProgress) => void,
  place: (pages: HTMLElement, page: T, index: number) => void,
): Promise<HTMLElement> {
  const pages = document.createElement('div')
  pages.setAttribute('data-segnavia-pages', '')
  const total = only === null || only === undefined ? plan.pages.length : 1
  let dressed = 0
  let dressedSinceYield = 0
  let yieldedAt = performance.now()
  for (let index = 0; index < plan.pages.length; index += 1) {
    if (only !== null && only !== undefined && only !== index + 1) continue
    const page = plan.pages[index]
    if (!page) continue
    place(pages, page, index)
    dressed += 1
    dressedSinceYield += 1
    const last = dressed === total
    const now = performance.now()
    if (!decideProgressYield({ dressedSinceYield, sinceYieldMs: now - yieldedAt, last })) continue
    const progress = boundComposeProgress({ pages: dressed, total })
    if (progress) report(progress)
    await progressMacrotask()
    dressedSinceYield = 0
    yieldedAt = performance.now()
  }
  return pages
}

export function embeddedComposerProgressFunctions(): string {
  return `var COMPOSE_PROGRESS_YIELD_MS=${COMPOSE_PROGRESS_YIELD_MS};
${embedFunction('boundComposeProgress', boundComposeProgress)}
${embedFunction('decideProgressYield', decideProgressYield)}
${embedFunction('reduceProgressHighWater', reduceProgressHighWater)}
${embedFunction('progressMacrotask', progressMacrotask)}
${embedFunction('dressPlanPages', dressPlanPages)}`
}
