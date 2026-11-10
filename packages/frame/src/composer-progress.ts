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

export function embeddedComposerProgressFunctions(): string {
  return `var COMPOSE_PROGRESS_PAGES_LIMIT=${COMPOSE_PROGRESS_PAGES_LIMIT};var COMPOSE_PROGRESS_YIELD_MS=${COMPOSE_PROGRESS_YIELD_MS};
${embedFunction('boundComposeProgress', boundComposeProgress)}
${embedFunction('decideProgressYield', decideProgressYield)}
${embedFunction('reduceProgressHighWater', reduceProgressHighWater)}
var progressMacrotask=function(){var yielding=globalThis.scheduler&&globalThis.scheduler.yield;if(yielding)return yielding.call(globalThis.scheduler);return new Promise(function(resolve){var channel=new MessageChannel();channel.port1.onmessage=function(){channel.port1.close();channel.port2.close();resolve();};channel.port2.postMessage(undefined);});};
var progressHighWater;var reportComposeProgress=function(progress){if(!config.progress)return;var next=reduceProgressHighWater(progressHighWater,progress);if(!next)return;progressHighWater=next;document.documentElement.setAttribute('${COMPOSE_PROGRESS_ATTRIBUTE}',next.pages+'/'+next.total);};`
}
