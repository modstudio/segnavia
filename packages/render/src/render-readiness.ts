import type { Scripts } from '@segnavia/format'
import { DIAGRAMS_DRAWN_ATTRIBUTE } from '@segnavia/frame/diagrams'
import { RenderRefusedError } from './errors.ts'
import { PAGE_READY_BOUND_MS } from './renderer.ts'

export const RENDER_READY_BINDING = '__segnaviaRenderReady'

export interface RenderReadiness {
  author: boolean
  diagrams: boolean
  layouts?: boolean
}

export function renderReadiness(scripts: Scripts, diagrams: boolean, waitForPageReady = true, layouts = false): RenderReadiness {
  return {
    author: waitForPageReady && scripts === 'sandboxed',
    diagrams: waitForPageReady && diagrams,
    layouts: waitForPageReady && layouts,
  }
}

export function waitsForReadiness(readiness: RenderReadiness): boolean {
  return Boolean(readiness.author || readiness.diagrams || readiness.layouts)
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
  if (readiness.layouts && !established.layouts) {
    missing.push("the page's layout provider galley and composed phases did not finish")
    clearing.push('make every layout provider galley and composed phase settle within the bound')
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
      throw new RenderRefusedError(
        readinessRefusal({ author: false, diagrams: true, layouts: false }, { author: true, diagrams: false, layouts: true }, PAGE_READY_BOUND_MS / 1000),
      )
    })
}
