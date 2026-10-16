import { describe, expect, test } from 'bun:test'
import type { Deck } from '@segnavia/format'
import { stageCanvasLayout } from './stage-layout.ts'

const deck = (layout: Deck['layout']) => ({ layout, size: { width: 1280, height: 720 } })

describe('stageCanvasLayout', () => {
  test('keeps the fixed deck canvas and scales it to several boxes', () => {
    expect(stageCanvasLayout(deck('fixed'), { width: 640, height: 360 })).toEqual({ size: deck('fixed').size, scale: 0.5 })
    expect(stageCanvasLayout(deck('fixed'), { width: 720, height: 520 })).toEqual({ size: deck('fixed').size, scale: 0.5625 })
    expect(stageCanvasLayout(deck('fixed'), { width: 360, height: 640 })).toEqual({ size: deck('fixed').size, scale: 0.28125 })
  })

  test('uses the rounded box as an unscaled responsive canvas', () => {
    expect(stageCanvasLayout(deck('responsive'), { width: 719.6, height: 519.5 })).toEqual({ size: { width: 720, height: 520 }, scale: 1 })
  })

  test('uses the deck aspect ratio when responsive box height is absent or zero', () => {
    expect(stageCanvasLayout(deck('responsive'), { width: 640 })).toEqual({ size: { width: 640, height: 360 }, scale: 1 })
    expect(stageCanvasLayout(deck('responsive'), { width: 320, height: 0 })).toEqual({ size: { width: 320, height: 180 }, scale: 1 })
  })
})
