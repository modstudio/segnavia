import type { Scripts } from '@segnavia/format'

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
  if (readiness.author && !established.author) missing.push('the page did not call window.pageReady()')
  if (readiness.diagrams && !established.diagrams) missing.push("the page's diagrams did not finish drawing")
  const facts = missing.join(' and ')
  return `${facts[0]?.toUpperCase()}${facts.slice(1)} within ${seconds}s.`
}
