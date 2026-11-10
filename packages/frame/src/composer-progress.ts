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

interface ProgressPages {
  setAttribute(name: string, value: string): void
}

export async function dressPlanPagesImplementation<T, P extends ProgressPages>(
  plan: { pages: T[] },
  only: number | null | undefined,
  report: (progress: ComposeProgress) => void,
  place: (pages: P, page: T, index: number) => void,
  createPages: () => P,
  now: () => number,
  yieldTask: () => Promise<void>,
): Promise<P> {
  const pages = createPages()
  pages.setAttribute('data-segnavia-pages', '')
  const total = only === null || only === undefined ? plan.pages.length : 1
  let dressed = 0
  let dressedSinceYield = 0
  let yieldedAt = now()
  for (let index = 0; index < plan.pages.length; index += 1) {
    if (only !== null && only !== undefined && only !== index + 1) continue
    const page = plan.pages[index]
    if (!page) continue
    place(pages, page, index)
    dressed += 1
    dressedSinceYield += 1
    const last = dressed === total
    const current = now()
    if (!decideProgressYield({ dressedSinceYield, sinceYieldMs: current - yieldedAt, last })) continue
    const progress = boundComposeProgress({ pages: dressed, total })
    if (progress) report(progress)
    await yieldTask()
    dressedSinceYield = 0
    yieldedAt = now()
  }
  return pages
}

export function embeddedComposerProgressFunctions(): string {
  return `var COMPOSE_PROGRESS_YIELD_MS=${COMPOSE_PROGRESS_YIELD_MS};
${embedFunction('boundComposeProgress', boundComposeProgress)}
${embedFunction('decideProgressYield', decideProgressYield)}
${embedFunction('reduceProgressHighWater', reduceProgressHighWater)}
var progressMacrotask=function(){var yielding=globalThis.scheduler&&globalThis.scheduler.yield;if(yielding)return yielding.call(globalThis.scheduler);return new Promise(function(resolve){var channel=new MessageChannel();channel.port1.onmessage=function(){channel.port1.close();channel.port2.close();resolve();};channel.port2.postMessage(undefined);});};
${embedFunction('dressPlanPagesImplementation', dressPlanPagesImplementation)}
var dressPlanPages=function(plan,only,report,place){return dressPlanPagesImplementation(plan,only,report,place,function(){return document.createElement('div');},function(){return performance.now();},progressMacrotask);};`
}
