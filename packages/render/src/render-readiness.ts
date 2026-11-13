import type { Scripts } from '@segnavia/format'
import { COMPOSE_FAILURE_TEXT_LIMIT } from '@segnavia/frame/bridge'
import { RenderRefusedError } from './errors.ts'
import { PAGE_READY_BOUND_MS } from './renderer.ts'

export const RENDER_READY_BINDING = '__segnaviaRenderReady'

export interface RenderReadiness {
  author: boolean
  layouts?: boolean
}

export function renderReadiness(scripts: Scripts, waitForPageReady = true, layouts = false): RenderReadiness {
  return {
    author: waitForPageReady && scripts === 'sandboxed',
    layouts: waitForPageReady && layouts,
  }
}

export function waitsForReadiness(readiness: RenderReadiness): boolean {
  return Boolean(readiness.author || readiness.layouts)
}

export function recordedLayoutRefusal(recorded: string | null, generic: string): string {
  return recorded ? recorded.slice(0, COMPOSE_FAILURE_TEXT_LIMIT) : generic
}

export function readinessRefusal(readiness: RenderReadiness, established: RenderReadiness, seconds: number): string {
  const missing: string[] = []
  const clearing: string[] = []
  if (readiness.author && !established.author) missing.push('the page did not call window.pageReady()')
  if (readiness.author && !established.author) clearing.push('call window.pageReady() or render with waitForPageReady: false')
  if (readiness.layouts && !established.layouts) {
    missing.push("the page's layout provider galley and composed phases did not finish")
    clearing.push('make every layout provider galley and composed phase settle within the bound')
  }
  const facts = missing.join(' and ')
  const remedy = clearing.join('; ')
  return `${facts[0]?.toUpperCase()}${facts.slice(1)} within ${seconds}s. ${remedy[0]?.toUpperCase()}${remedy.slice(1)} to clear this refusal.`
}

