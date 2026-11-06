import type { Fragmentation } from '@segnavia/format'

const SAFE_FRAGMENTATION_CSS =
  ':where(tr,thead,tfoot,figure,img,svg){break-inside:avoid}:where(thead){display:table-header-group}:where(tfoot){display:table-footer-group}:where(h1,h2,h3,h4,h5,h6){break-after:avoid}'

const FRAGMENTATION_CSS: Record<Fragmentation, string> = { safe: SAFE_FRAGMENTATION_CSS, none: '' }

export function fragmentationCss(fragmentation: Fragmentation): string {
  return FRAGMENTATION_CSS[fragmentation]
}
