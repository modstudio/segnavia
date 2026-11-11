import type { PreflightReport } from '@segnavia/format'

export function installDocumentPagePreflight(element: EventTarget, preflight: (report: PreflightReport) => void): void {
  element.addEventListener('preflight', (event) => {
    event.stopPropagation()
    preflight((event as CustomEvent<PreflightReport>).detail)
  })
}
