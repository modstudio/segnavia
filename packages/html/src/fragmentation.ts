import type { Fragmentation } from '@segnavia/format'

const SAFE_FRAGMENTATION_CSS =
  ':where(tr,thead,tfoot,figure,img,svg){break-inside:avoid}:where(thead){display:table-header-group}:where(tfoot){display:table-footer-group}:where(h1,h2,h3,h4,h5,h6){break-after:avoid}'

export function fragmentationCss(fragmentation: Fragmentation): string {
  return fragmentation === 'safe' ? SAFE_FRAGMENTATION_CSS : ''
}
