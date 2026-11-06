import type { Scripts } from '@segnavia/format'
import { DIAGRAMS_DRAWN_ATTRIBUTE } from '@segnavia/frame/diagrams'
import { RenderRefusedError } from './errors.ts'
import { PAGE_READY_BOUND_MS } from './renderer.ts'

export const RENDER_READY_BINDING = '__segnaviaRenderReady'

export interface RenderReadiness {
  author: boolean
  diagrams: boolean
}

export function renderReadiness(scripts: Scripts, diagrams: boolean, waitForPageReady = true): RenderReadiness {
  return {
    author: waitForPageReady && scripts === 'sandboxed',
    diagrams: waitForPageReady && diagrams,
  }
}

export function waitsForReadiness(readiness: RenderReadiness): boolean {
  return readiness.author || readiness.diagrams
}

export function readinessRefusal(readiness: RenderReadiness, established: RenderReadiness, seconds: number): string {
  const missing: string[] = []
  const clearing: string[] = []
  if (readiness.author && !established.author) missing.push('the page did not call window.pageReady()')
  if (readiness.author && !established.author) clearing.push('call window.pageReady() or render with waitForPageReady: false')
  if (readiness.diagrams && !established.diagrams) {
    missing.push("the page's diagrams did not finish drawing")
    clearing.push('correct or simplify the diagram source so it draws within the bound')
  }
  const facts = missing.join(' and ')
  const remedy = clearing.join('; ')
  return `${facts[0]?.toUpperCase()}${facts.slice(1)} within ${seconds}s. ${remedy[0]?.toUpperCase()}${remedy.slice(1)} to clear this refusal.`
}

interface DiagramScope {
  locator(selector: string): {
    waitFor(options: { timeout: number }): Promise<void>
  }
}

export async function waitForDiagramReadiness(scope: DiagramScope, readiness: RenderReadiness): Promise<void> {
  if (!readiness.diagrams) return
  await scope
    .locator(`html[${DIAGRAMS_DRAWN_ATTRIBUTE}]`)
    .waitFor({ timeout: PAGE_READY_BOUND_MS })
    .catch(() => {
      throw new RenderRefusedError(readinessRefusal({ author: false, diagrams: true }, { author: true, diagrams: false }, PAGE_READY_BOUND_MS / 1000))
    })
}
