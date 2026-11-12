export function fitWatermarkText(): void {
  for (const mark of document.querySelectorAll<HTMLElement>('.segnavia-watermark')) {
    const text = mark.querySelector<HTMLElement>('bdi')
    if (!text) continue
    const style = getComputedStyle(mark)
    const current = Number.parseFloat(style.fontSize)
    const target = Number.parseFloat(style.inlineSize)
    const transform = mark.style.transform
    mark.style.transform = 'none'
    const measured = text.getBoundingClientRect().width
    mark.style.transform = transform
    if (current > 0 && target > 0 && measured > 0) mark.style.fontSize = `${(current * target) / measured}px`
  }
}
