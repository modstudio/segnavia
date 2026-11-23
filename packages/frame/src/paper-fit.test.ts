import { expect, test } from 'bun:test'
import { fitPaper } from './paper-fit.ts'
import { paperBoxSize } from './paper-geometry.ts'

test('a paper box scales from its pixel width, not its millimeter width', () => {
  const paper = { width: 210, height: 297 }
  const box = { style: { transform: '' } }
  const element = { clientWidth: paperBoxSize(paper).width / 2, querySelector: () => box } as unknown as HTMLElement
  fitPaper(element, { paper })
  expect(box.style.transform).toBe('scale(0.5)')
})
