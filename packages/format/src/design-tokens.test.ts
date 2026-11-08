import { describe, expect, test } from 'bun:test'
import { exportDesignTokens, importDesignTokens } from './design-tokens.ts'

describe('W3C design-token exchange', () => {
  test('round-trips colors, dimensions and font families', () => {
    const tokens = {
      colors: { ink: '#123456', wash: '#abcdef80' },
      dimensions: {
        pixels: { value: 12, unit: 'px' as const },
        root: { value: 1.5, unit: 'rem' as const },
        millimeters: { value: 10, unit: 'mm' as const },
        points: { value: 9, unit: 'pt' as const },
        centimeters: { value: 2, unit: 'cm' as const },
        inches: { value: 1, unit: 'in' as const },
      },
      fontFamilies: { body: ['Noto Sans', 'sans-serif'] },
    }
    expect(importDesignTokens(exportDesignTokens(tokens))).toEqual(tokens)
  })

  test('refuses em on export by token name', () => {
    expect(() => exportDesignTokens({ dimensions: { spacing: { value: 1, unit: 'em' } } })).toThrow(/spacing.*em/)
  })

  test('flattens groups, accepts a string family and resolves alias chains', () => {
    expect(
      importDesignTokens({
        palette: { $type: 'color', ink: { $value: { colorSpace: 'srgb', components: [0, 0, 0], hex: '#000000' } } },
        aliases: { $type: 'color', first: { $value: '{palette.ink}' }, second: { $value: '{aliases.first}' } },
        typography: { $type: 'fontFamily', body: { $value: 'serif' } },
      }),
    ).toEqual({
      colors: { 'palette-ink': '#000000', 'aliases-first': '#000000', 'aliases-second': '#000000' },
      dimensions: {},
      fontFamilies: { 'typography-body': ['serif'] },
    })
  })

  test('keeps prototype-key group names in flattened paths', () => {
    const red = { colorSpace: 'srgb', components: [1, 0, 0], hex: '#ff0000' }
    expect(importDesignTokens({ constructor: { $type: 'color', primary: { $value: red } } }).colors).toEqual({ 'constructor-primary': '#ff0000' })
    expect(() => importDesignTokens({ toString: { $type: 'color', secondary: { $value: red } } })).toThrow(/toString\.secondary.*"toString-secondary"/)
  })

  test.each([
    [{ bad: { $ref: '#/color/ink' } }, /bad.*\$ref/],
    [{ bad: { $type: 'shadow', token: { $value: 1 } } }, /bad.*unknown \$type/],
    [{ bad: { $type: 'color', token: { $value: { colorSpace: 'display-p3', components: [0, 0, 0] } } } }, /bad.token.*display-p3/],
    [{ bad: { $type: 'color', token: { $value: '{missing.token}' } } }, /bad.token.*unresolved/],
    [{ bad: { $type: 'color', first: { $value: '{bad.second}' }, second: { $value: '{bad.first}' } } }, /cyclic alias/],
  ])('refuses unsupported import %p with its path', (input, message) => {
    expect(() => importDesignTokens(input)).toThrow(message as RegExp)
  })
})
