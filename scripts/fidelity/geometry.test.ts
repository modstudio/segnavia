import { describe, expect, test } from 'bun:test'
import { Print, printBoxes } from '@segnavia/format'
import { bleedViewport, trimRasterBox } from './geometry.ts'

describe('fidelity print geometry', () => {
  test('maps the fractional A5 bleed and trim edges independently in device pixels', () => {
    const boxes = printBoxes(Print.parse({ paper: 'a5', bleed: 3 }))
    expect(bleedViewport(boxes.bleedBox)).toEqual({ width: 583, height: 817 })
    expect(trimRasterBox(boxes.bleedBox, boxes.trim, 4)).toEqual({ x: 45, y: 45, width: 2238, height: 3175 })
  })
})
