import { formatNumber, type NumberSystem } from '@segnavia/format'
import { compact, pageWith } from './book-text.ts'

export function verifyContinuousPageReference(
  pages: string[],
  fixture: 'english' | 'hebrew',
  marker: string,
  targetMarker: string,
  frontPages: number,
  frontSystem: NumberSystem,
  system: NumberSystem,
  check: (what: string, ok: boolean, detail?: string) => void,
): void {
  const targetBodyPage = pageWith(pages, targetMarker) - frontPages
  const expected = formatNumber(targetBodyPage, system)
  const referencePage = pages.find((page) => page.includes(marker)) ?? ''
  const printed = compact(referencePage)
  check(
    `${fixture} continuous PDF page reference uses its target body folio`,
    printed.includes(marker) && printed.includes(expected),
    `expected ${expected} for body page ${targetBodyPage}`,
  )
  const frontMarker = `F2B-${fixture === 'hebrew' ? 'HE' : 'EN'}`
  const frontText = compact(pages.slice(0, frontPages).find((page) => page.includes(frontMarker)) ?? '')
  check(
    `${fixture} continuous PDF front-to-body page reference uses its target body folio`,
    frontText.includes(frontMarker) && frontText.includes(expected),
    `expected ${expected}`,
  )
  const frontFolio = formatNumber(1, frontSystem)
  const bodyMarker = `B2F-${fixture === 'hebrew' ? 'HE' : 'EN'}`
  const bodyText = compact(pages.slice(frontPages).find((page) => page.includes(bodyMarker)) ?? '')
  check(
    `${fixture} continuous PDF body-to-front page reference uses the front folio`,
    bodyText.includes(bodyMarker) && bodyText.includes(frontFolio),
    `expected ${frontFolio}`,
  )
}
