import { boundComposeProgress, COMPOSE_PROGRESS_PAGES_LIMIT, type ComposeProgress } from '@segnavia/format'
import { embedFunction } from '@segnavia/html'

export const COMPOSE_PROGRESS_YIELD_MS = 50
export const COMPOSE_PROGRESS_ATTRIBUTE = 'data-segnavia-compose-progress'

export interface ProgressYieldFacts {
  sinceYieldMs: number
  last: boolean
}

export function decideProgressYield(facts: ProgressYieldFacts): boolean {
  return facts.last || facts.sinceYieldMs >= COMPOSE_PROGRESS_YIELD_MS
}

export function reduceProgressHighWater(highWater: ComposeProgress | undefined, progress: ComposeProgress): ComposeProgress | undefined {
  if (!highWater) return progress
  if (progress.total === highWater.total && progress.pages <= highWater.pages) return undefined
  if (progress.total !== highWater.total && progress.pages <= Math.min(highWater.pages, progress.total) && progress.pages !== progress.total) return undefined
  return progress
}

export function composeProgressTotal(pageCount: number, only: number | null | undefined): number {
  return only === null || only === undefined ? pageCount : 1
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
  const total = composeProgressTotal(plan.pages.length, only)
  let dressed = 0
  let yieldedAt = now()
  for (let index = 0; index < plan.pages.length; index += 1) {
    if (only !== null && only !== undefined && only !== index + 1) continue
    const page = plan.pages[index]
    if (!page) continue
    place(pages, page, index)
    dressed += 1
    const last = dressed === total
    const current = now()
    if (!decideProgressYield({ sinceYieldMs: current - yieldedAt, last })) continue
    const progress = boundComposeProgress({ pages: dressed, total })
    if (progress) report(progress)
    await yieldTask()
    yieldedAt = now()
  }
  return pages
}

export function embeddedComposerProgressFunctions(): string {
  return `var COMPOSE_PROGRESS_PAGES_LIMIT=${COMPOSE_PROGRESS_PAGES_LIMIT};var COMPOSE_PROGRESS_YIELD_MS=${COMPOSE_PROGRESS_YIELD_MS};
${embedFunction('boundComposeProgress', boundComposeProgress)}
${embedFunction('decideProgressYield', decideProgressYield)}
${embedFunction('reduceProgressHighWater', reduceProgressHighWater)}
${embedFunction('composeProgressTotal', composeProgressTotal)}
var progressMacrotask=function(){var yielding=globalThis.scheduler&&globalThis.scheduler.yield;if(yielding)return yielding.call(globalThis.scheduler);return new Promise(function(resolve){var channel=new MessageChannel();channel.port1.onmessage=function(){channel.port1.close();channel.port2.close();resolve();};channel.port2.postMessage(undefined);});};
${embedFunction('dressPlanPagesImplementation', dressPlanPagesImplementation)}
var dressPlanPages=function(plan,only,report,place){return dressPlanPagesImplementation(plan,only,report,place,function(){return document.createElement('div');},function(){return performance.now();},progressMacrotask);};`
}
