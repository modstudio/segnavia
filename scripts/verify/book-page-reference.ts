import { formatNumber, type NumberSystem } from '@segnavia/format'

export function verifyContinuousPageReference(
  pages: string[],
  marker: string,
  targetMarker: string,
  frontPages: number,
  system: NumberSystem,
  check: (what: string, ok: boolean, detail?: string) => void,
): void {
  const targetBodyPage = pages.findIndex((page) => page.includes(targetMarker)) + 1 - frontPages
  const expected = formatNumber(targetBodyPage, system)
  const referencePage = pages.find((page) => page.includes(marker)) ?? ''
  const compact = referencePage.replaceAll(/[\s\u202a-\u202e\u2066-\u2069]/g, '')
  check(
    `${marker.startsWith('REF-HE') ? 'hebrew' : 'english'} continuous PDF page reference uses its target body folio`,
    compact.includes(marker) && compact.includes(expected),
    `expected ${expected} for body page ${targetBodyPage}`,
  )
}
