import type { HeadTemplate } from '@segnavia/format'
import { resolveHeadTemplate } from '@segnavia/layout'

export function fillRegion(html: string, values: { heads: Record<string, string> }, _direction?: string, _lang?: string): string {
  function attribute(attrs: string, name: string): string | undefined {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const found = new RegExp(`\\s${escaped}\\s*=\\s*(?:(["'])([^"']*)\\1|([^\\s>]+))`, 'i').exec(attrs)
    return found?.[2] ?? found?.[3]
  }
  return html.replace(
    /<([a-zA-Z][\w:-]*)([^>]*?)\sdata-motif\s*=\s*(?:(["'])segnavia:head-template\3|segnavia:head-template)([^>]*)>([\s\S]*?)<\/\1>/gi,
    (_match, tag, before, _quote, after) => {
      const attrs = `${before}${after}`
      const name = attribute(attrs, 'data-motif-name')
      const value = name === undefined ? undefined : values.heads[name]
      if (!value) return ''
      const outputAttrs = attrs.replace(/\sdata-motif(?:-[\w-]+)?\s*=\s*(?:(["'])([^"']*)\1|[^\s>]+)/gi, '')
      return `<${tag}${outputAttrs}>${value}</${tag}>`
    },
  )
}

export function resolveRegionHeads(
  templates: readonly HeadTemplate[],
  variables: Readonly<Record<string, string>>,
  recordSlots: Readonly<Record<string, string | undefined>>,
  direction?: string,
  lang?: string,
): Record<string, string> {
  const declared = direction === 'ltr' || direction === 'rtl' || direction === 'auto' ? direction : undefined
  return Object.fromEntries(templates.map((template) => [template.name, resolveHeadTemplate(template, variables, recordSlots, declared, lang)]))
}

export interface RegionExcess {
  block: number
  inline: number
}

export function markFurnitureOverflow(region: HTMLElement, page: Element): void {
  const excess = region.scrollHeight - region.clientHeight
  if (excess <= 0.5) return
  const kind = region.hasAttribute('data-segnavia-head') ? 'head' : 'foot'
  page.setAttribute('data-segnavia-furniture-overflow', `${region.getAttribute('data-segnavia-parent') ?? ''}:${kind}:${excess}`)
}

export function markRegionOverflow(root: Element, folio: string, excessOf: (element: Element) => RegionExcess): void {
  const regions = root.querySelectorAll('[data-region]')
  for (const region of regions) {
    const name = region.getAttribute('data-region')
    if (!name) continue
    const excess = excessOf(region)
    if (excess.block <= 0.5 && excess.inline <= 0.5) continue
    region.setAttribute('data-segnavia-region-overflow', `${folio}:${name}:${Math.max(excess.block, excess.inline)}`)
  }
}

export function dressPlanPages<T>(
  plan: { pages: T[] },
  only: number | null | undefined,
  place: (pages: HTMLElement, page: T, index: number) => void,
): HTMLElement {
  const pages = document.createElement('div')
  pages.setAttribute('data-segnavia-pages', '')
  for (let index = 0; index < plan.pages.length; index += 1) {
    if (only !== null && only !== undefined && only !== index + 1) continue
    const page = plan.pages[index]
    if (page) place(pages, page, index)
  }
  return pages
}

export function fillFurniture(
  root: Element,
  html: string,
  heads: Record<string, string>,
  slots: Record<string, string | undefined>,
  dir: string | undefined,
  lang: string | undefined,
): void {
  root.innerHTML = fillRegion(html, { heads }, dir, lang)
  const bindings = root.querySelectorAll('[data-slot-value]')
  for (const binding of bindings) {
    const path = binding.getAttribute('data-slot-value')
    if (!path || !Object.hasOwn(slots, path)) continue
    const value = slots[path]
    if (value === undefined) {
      binding.remove()
      continue
    }
    binding.removeAttribute('data-slot-value')
    binding.textContent = value
    if (!binding.hasAttribute('dir')) binding.setAttribute('dir', 'auto')
  }
}
