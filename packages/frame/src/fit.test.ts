import { describe, expect, test } from 'bun:test'
import { fitSheet } from './fit.ts'

describe('viewport fit', () => {
  test('subtracts inline padding and both reserved block edges', () => {
    expect(
      fitSheet({
        width: 1000,
        height: 700,
        paddingInlineStart: 20,
        paddingInlineEnd: 20,
        reserveBlockStart: 40,
        reserveBlockEnd: 120,
        sheetWidth: 1280,
        sheetHeight: 720,
      }),
    ).toEqual({ scale: 0.75, width: 960, height: 540 })
  })

  test('falls back to width when no block space remains and may enlarge', () => {
    expect(
      fitSheet({
        width: 2560,
        height: 100,
        paddingInlineStart: 0,
        paddingInlineEnd: 0,
        reserveBlockStart: 50,
        reserveBlockEnd: 50,
        sheetWidth: 1280,
        sheetHeight: 720,
      }).scale,
    ).toBe(2)
  })

  test.each([
    [
      { width: 100, height: 200 },
      { width: 50, height: 100 },
    ],
    [
      { width: 200, height: 100 },
      { width: 100, height: 50 },
    ],
  ])('fits a $width by $height designed cover whole and centered in a square tile', (sheet, fitted) => {
    const result = fitSheet({
      width: 100,
      height: 100,
      paddingInlineStart: 0,
      paddingInlineEnd: 0,
      reserveBlockStart: 0,
      reserveBlockEnd: 0,
      sheetWidth: sheet.width,
      sheetHeight: sheet.height,
    })
    expect(result).toMatchObject(fitted)
    expect({ inline: (100 - result.width) / 2, block: (100 - result.height) / 2 }).toEqual({
      inline: (100 - fitted.width) / 2,
      block: (100 - fitted.height) / 2,
    })
  })
})
