import { type ParentRules, TEMPLATED_PARENT_RULES, textHoldingParentRules } from '@segnavia/format'
import { embedFunction } from '@segnavia/html'
import { flowTextArea, flowTextAreas } from './composer-measure.ts'

export interface StagedSource {
  clone: HTMLElement
  fitted: HTMLElement
  source: HTMLElement
}

export interface SourceGeometry {
  paperWidth: number
  paperHeight: number
  parents: Array<{ name: string; textArea: { width: number; height: number } }>
}

export function parentsOf(element: Element | null | undefined): ParentRules | null {
  if (!element) return null
  const rules = element.getAttribute('data-segnavia-parent-rules')
  return rules ? JSON.parse(rules) : null
}

export function mergeParents(section: ParentRules | null, template: ParentRules | null): ParentRules | undefined {
  return section || template || undefined
}

export function templateParentRules(flow: Element | null | undefined, template: Element | null | undefined): ParentRules | undefined {
  return mergeParents(parentsOf(flow), parentsOf(template))
}

export function templateStagingArea(
  holder: HTMLElement,
  template: HTMLElement,
  geometry: Pick<SourceGeometry, 'parents'>,
  templateName: string,
): { width: number; height: number } {
  const flow = holder.closest<HTMLElement>('[data-segnavia-flow]')
  const rules = templateParentRules(flow, template)
  const areas = Object.fromEntries(geometry.parents.map((parent) => [parent.name, parent.textArea]))
  try {
    const selected = flowTextAreas(rules, areas, 'fixed', 'body', () => TEMPLATED_PARENT_RULES)
    return {
      width: Math.min(...selected.map((area) => area.width)),
      height: Math.min(...selected.map((area) => area.height)),
    }
  } catch {
    throw new Error(`template "${templateName}" has no text area; configure a page parent to clear this refusal`)
  }
}

export function embeddedComposerStagingFunctions(): string {
  return `var TEMPLATED_PARENT_RULES=${JSON.stringify(TEMPLATED_PARENT_RULES)};
${embedFunction('textHoldingParentRules', textHoldingParentRules)}
${embedFunction('flowTextAreas', flowTextAreas)}
${embedFunction('flowTextArea', flowTextArea)}
${embedFunction('parentsOf', parentsOf)}
${embedFunction('mergeParents', mergeParents)}
${embedFunction('templateParentRules', templateParentRules)}
${embedFunction('templateStagingArea', templateStagingArea)}`
}

export function stagedSourceExcluded(element: HTMLElement): boolean {
  return element.closest('[data-segnavia-template],[data-segnavia-templated-page],[data-segnavia-designed-page]') !== null
}

export function blockSubject(element: HTMLElement, fallback = ''): string {
  return element.getAttribute('data-segnavia-id') ?? element.closest<HTMLElement>('[data-segnavia-id]')?.getAttribute('data-segnavia-id') ?? fallback
}
