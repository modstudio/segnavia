export function fillTemplateRegions(clone: HTMLElement, holder: HTMLElement): void {
  for (const fragment of Array.from(holder.querySelectorAll<HTMLElement>('[data-region]'))) {
    const name = fragment.getAttribute('data-region')
    if (!name) continue
    const target = Array.from(clone.querySelectorAll<HTMLElement>('[data-region]')).find((region) => region.getAttribute('data-region') === name)
    if (!target) continue
    target.replaceChildren(...Array.from(fragment.childNodes).map((child) => child.cloneNode(true)))
  }
}

export function inkExcess(element: HTMLElement, box: HTMLElement = element): { block: number; inline: number } {
  const bounds = box.getBoundingClientRect()
  let top = bounds.top
  let right = bounds.right
  let bottom = bounds.bottom
  let left = bounds.left
  const include = (rect: DOMRect) => {
    if (rect.width === 0 && rect.height === 0) return
    top = Math.min(top, rect.top)
    right = Math.max(right, rect.right)
    bottom = Math.max(bottom, rect.bottom)
    left = Math.min(left, rect.left)
  }
  const range = document.createRange()
  range.selectNodeContents(element)
  if (!range.collapsed) include(range.getBoundingClientRect())
  for (const child of Array.from(element.querySelectorAll<HTMLElement>('*'))) include(child.getBoundingClientRect())
  const vertical = getComputedStyle(box).writingMode.startsWith('vertical')
  const block = Math.max(bottom - bounds.bottom, bounds.top - top, element === box ? box.scrollHeight - bounds.height : 0)
  const inline = Math.max(right - bounds.right, bounds.left - left, element === box ? box.scrollWidth - bounds.width : 0)
  return vertical ? { block: inline, inline: block } : { block, inline }
}
