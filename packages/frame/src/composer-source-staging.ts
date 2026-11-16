import { type ParentRules, TEMPLATED_PARENT_RULES } from '@segnavia/format'
import { flowTextArea } from './composer-measure.ts'

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

export function templateStagingArea(
  holder: HTMLElement,
  template: HTMLElement,
  geometry: Pick<SourceGeometry, 'parents'>,
  templateName: string,
): { width: number; height: number } {
  const flow = holder.closest<HTMLElement>('[data-segnavia-flow]')
  const rules = parentsOf(flow) ?? parentsOf(template) ?? undefined
  const areas = Object.fromEntries(geometry.parents.map((parent) => [parent.name, parent.textArea]))
  try {
    return flowTextArea(rules, areas, 'fixed', 'body', () => TEMPLATED_PARENT_RULES)
  } catch {
    throw new Error(`template "${templateName}" has no text area; configure a page parent to clear this refusal`)
  }
}

export function stagedSourceExcluded(element: HTMLElement): boolean {
  return element.closest('[data-segnavia-template],[data-segnavia-templated-page],[data-segnavia-designed-page]') !== null
}

export function blockSubject(element: HTMLElement, fallback = ''): string {
  return element.getAttribute('data-segnavia-id') ?? element.closest<HTMLElement>('[data-segnavia-id]')?.getAttribute('data-segnavia-id') ?? fallback
}
