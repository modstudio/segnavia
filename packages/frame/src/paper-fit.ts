import { paperScale } from './paper-geometry.ts'

export function fitPaper(element: HTMLElement, imposed: { paper: { width: number } } | null): void {
  const box = element.querySelector<HTMLElement>('.segnavia-paper__paper')
  if (!box || !imposed) return
  const scale = paperScale(element.clientWidth, imposed.paper.width)
  box.style.transform = scale === 1 ? '' : `scale(${scale})`
}
