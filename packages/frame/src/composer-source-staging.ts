export interface StagedSource {
  clone: HTMLElement
  fitted: HTMLElement
  source: HTMLElement
}

export interface SourceGeometry {
  paperWidth: number
  paperHeight: number
  parents: Array<{ textArea: { width: number; height: number } }>
}

export function stagedSourceExcluded(element: HTMLElement): boolean {
  return element.closest('[data-segnavia-template],[data-segnavia-templated-page],[data-segnavia-designed-page]') !== null
}

export function blockSubject(element: HTMLElement, fallback = ''): string {
  return element.getAttribute('data-segnavia-id') ?? element.closest<HTMLElement>('[data-segnavia-id]')?.getAttribute('data-segnavia-id') ?? fallback
}
