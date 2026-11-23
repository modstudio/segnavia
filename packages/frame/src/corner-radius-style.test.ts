import { expect, test } from 'bun:test'
import { CORNER_SCALE_CSS } from './controls-style.ts'

test('the corner scale reproduces the styled component defaults at 12px', () => {
  const roles = {
    control: [5, 6, 10],
    field: [2, 3, 8],
    'menu-item': [7, 12, 7],
    menu: [1, 2, 6],
    'list-item': [5, 12, 5],
    mark: [1, 3, 4],
    line: [1, 6, 2],
  } as const

  expect(CORNER_SCALE_CSS).toContain('--_radius:var(--segnavia-radius,12px)')
  for (const [role, [numerator, denominator, defaultRadius]] of Object.entries(roles)) {
    expect(CORNER_SCALE_CSS).toContain(`--_radius-${role}:calc(var(--_radius) * ${numerator} / ${denominator})`)
    expect((12 * numerator) / denominator).toBe(defaultRadius)
  }
})

test('styled corner declarations use the corner scale or a named exception', async () => {
  const exceptions = new Map([
    ['base-style.ts:inherit', 1],
    ['controls.ts:50%', 1],
    ['item-settings-style.ts:var(--segnavia-radius,0)', 1],
    ['player-style.ts:0', 2],
    ['print-document.ts:${frame.borderRadius', 1],
  ])
  const foundExceptions = new Map<string, number>()

  const files = [...new Bun.Glob('*.ts').scanSync(import.meta.dir)].filter((name) => !name.endsWith('.test.ts')).sort()
  for (const file of files) {
    const source = await Bun.file(`${import.meta.dir}/${file}`).text()
    for (const match of source.matchAll(/border-radius:([^;}]+)/g)) {
      const value = match[1]?.trim() ?? ''
      if (value.includes('var(--_radius')) continue
      const exception = `${file}:${value}`
      expect(exceptions.has(exception), `unexpected corner declaration ${exception}`).toBeTrue()
      foundExceptions.set(exception, (foundExceptions.get(exception) ?? 0) + 1)
    }
  }

  expect(foundExceptions).toEqual(exceptions)
})
