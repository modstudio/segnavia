export interface FurnitureValues {
  folio?: string
  runningHead?: string
  marks?: Record<string, { first: string; last: string }>
  total?: string
}

export function dressPlanPages<T>(plan: { pages: T[] }, only: number | null | undefined, place: (pages: HTMLElement, page: T, index: number) => void): HTMLElement {
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
  values: FurnitureValues,
  dir: string | undefined,
  lang: string | undefined,
  numberPath: string,
  totalPath: string,
  fillMotifs: (source: string, values: FurnitureValues, dir?: string, lang?: string) => string,
): void {
  root.innerHTML = fillMotifs(html, values, dir, lang)
  const slots: Record<string, string | undefined> = { [numberPath]: values.folio, [totalPath]: values.total }
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
