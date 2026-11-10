import { expect, test } from 'bun:test'
import type { BoardView } from '@segnavia/format'
import { placeBoardNode } from './board-placement.ts'

const view: BoardView = { zoom: 2, pan: { x: 0, y: 0 }, viewport: { width: 800, height: 600 } }

test('clears logical sizes when a placement has no width or height', () => {
  const node = { style: {} as CSSStyleDeclaration } as HTMLElement
  placeBoardNode(node, view, { x: 0, y: 0, width: 40, height: 20 })
  expect(node.style.inlineSize).toBe('80px')
  expect(node.style.blockSize).toBe('40px')

  placeBoardNode(node, view, { x: 0, y: 0 })
  expect(node.style.inlineSize).toBe('')
  expect(node.style.blockSize).toBe('')
})
