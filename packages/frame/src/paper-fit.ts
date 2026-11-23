import { paperBoxSize, paperScale } from './paper-geometry.ts'

// Scales the drawn paper box, sized in CSS pixels from the paper's millimeters, to the element's width.
export function fitPaper(element: HTMLElement, imposed: { paper: { width: number; height: number } } | null): void {
  const box = element.querySelector<HTMLElement>('.segnavia-paper__paper')
  if (!box || !imposed) return
  const scale = paperScale(element.clientWidth, paperBoxSize(imposed.paper).width)
  box.style.transform = scale === 1 ? '' : `scale(${scale})`
}
