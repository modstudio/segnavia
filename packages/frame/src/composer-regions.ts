import type { HeadTemplate, ResolvedParentPage, TextDirection } from '@segnavia/format'
import type { regionBox } from '@segnavia/layout'

interface RegionPage {
  face: 'recto' | 'verso'
  flow: string
  variables?: Record<string, string>
}

interface RegionConfig {
  direction: TextDirection
  dir?: string
  lang?: string
  headTemplates?: readonly HeadTemplate[]
  recordSlotsByFlow?: Record<string, Record<string, string | undefined>>
}

export function placeParentRegions(
  paper: HTMLElement,
  parent: ResolvedParentPage & { textArea: { width: number; height: number } },
  page: RegionPage,
  config: RegionConfig,
  boxFor: typeof regionBox,
  headsFor: (
    templates: readonly HeadTemplate[],
    variables: Readonly<Record<string, string>>,
    slots: Readonly<Record<string, string | undefined>>,
    direction?: string,
    lang?: string,
  ) => Record<string, string>,
  fill: (root: Element, html: string, heads: Record<string, string>, slots: Record<string, string | undefined>, dir?: string, lang?: string) => void,
  create: (tag: string) => HTMLElement,
): void {
  const slots = config.recordSlotsByFlow?.[page.flow] ?? {}
  const heads = headsFor(config.headTemplates ?? [], page.variables ?? {}, slots, config.dir, config.lang)
  for (const [name, region] of Object.entries(parent.regions)) {
    const box = boxFor(region.edge, parent.margin, parent.textArea, { direction: config.direction, face: page.face })
    const held = create('div')
    held.setAttribute('data-segnavia-region', name)
    held.setAttribute('data-segnavia-edge', region.edge)
    held.setAttribute('data-segnavia-parent', parent.name)
    if (config.lang) held.setAttribute('lang', config.lang)
    held.style.cssText = `position:absolute;overflow:hidden;top:${box.top}px;left:${box.left}px;width:${box.width}px;height:${box.height}px`
    fill(held, region.html, heads, slots, config.dir, config.lang)
    const overflow = held.querySelector?.<HTMLElement>('[data-overflow]')?.getAttribute('data-overflow')
    if (overflow) held.setAttribute('data-overflow', overflow)
    const repeat = (globalThis as typeof globalThis & { repeatFill?: (region: HTMLElement) => unknown }).repeatFill
    if (repeat && typeof held.querySelector === 'function') {
      const added = repeat(held) as Array<{ subject: string; fillCount?: number }>
      const shared = globalThis as typeof globalThis & { preflightRegions?: Array<{ subject: string; fillCount?: number }> }
      for (const fact of added) {
        const existing = shared.preflightRegions?.find((candidate) => candidate.subject === fact.subject && candidate.fillCount !== undefined)
        if (existing) existing.fillCount = fact.fillCount
        else shared.preflightRegions?.push(fact)
      }
    }
    paper.append(held)
  }
}
