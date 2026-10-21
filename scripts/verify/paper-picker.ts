import type { Harness } from './harness.ts'

export async function verifyPaperPicker(h: Harness) {
  const { page, check } = h
  await page.goto(h.url('paper-picker.html'))
  const picker = page.locator('segnavia-paper-picker')
  const pickerValue = () => page.locator('output').evaluate((output: HTMLOutputElement) => output.value)
  const paper = picker.locator('.paper select')
  await paper.focus()
  await page.keyboard.press('l')
  await page.keyboard.press('Tab')
  const named = JSON.parse(await pickerValue()) as { paper: string }
  const selected = await paper.inputValue()
  check('the paper picker selects and emits a named paper from the keyboard', named.paper === selected && selected !== 'a4', JSON.stringify(named))

  await paper.selectOption('custom')
  await picker.locator('input[name="width"]').fill('100')
  await picker.locator('input[name="width"]').press('Tab')
  await picker.locator('input[name="height"]').fill('150')
  await picker.locator('input[name="height"]').press('Tab')
  const custom = JSON.parse(await pickerValue()) as { paper: unknown }
  check('the paper picker emits a custom size', JSON.stringify(custom.paper) === '{"width":100,"height":150,"unit":"mm"}', JSON.stringify(custom))

  const landscape = picker.locator('button[value="landscape"]')
  await landscape.focus()
  await page.keyboard.press('Space')
  const oriented = JSON.parse(await pickerValue()) as { orientation: string }
  check('the paper picker toggles orientation from the keyboard', oriented.orientation === 'landscape', JSON.stringify(oriented))

  const width = picker.locator('input[name="width"]')
  await width.fill('9')
  await width.press('Tab')
  const refused = JSON.parse(await pickerValue()) as { paper: { width: number } }
  check(
    'the paper picker refuses a custom side below its bound',
    refused.paper.width === 100 && (await width.evaluate((input: HTMLInputElement) => !input.validity.valid)),
  )

  const boundaries = await picker.evaluate((element) => {
    const pickerElement = element as typeof element & {
      value: { paper: string | { width: number; height: number; unit: 'mm' | 'in' | 'pt' }; orientation: 'portrait' | 'landscape' }
    }
    const unit = pickerElement.shadowRoot?.querySelector<HTMLSelectElement>('select[name="unit"]')
    if (!unit) return []
    const millimetersPerUnit = { mm: 1, in: 25.4, pt: 25.4 / 72 }
    const results: Array<{ bound: number; unit: string; millimeters: number }> = []
    for (const bound of [10, 2000]) {
      for (const nextUnit of ['mm', 'in', 'pt'] as const) {
        pickerElement.value = { paper: { width: bound, height: bound, unit: 'mm' }, orientation: 'portrait' }
        unit.value = nextUnit
        unit.dispatchEvent(new Event('change', { bubbles: true }))
        const paper = pickerElement.value.paper
        if (typeof paper !== 'string') {
          results.push({ bound, unit: nextUnit, millimeters: paper.width * millimetersPerUnit[paper.unit] })
        }
      }
    }
    return results
  })
  check(
    'the paper picker preserves both custom-paper bounds in every unit',
    boundaries.length === 6 && boundaries.every(({ bound, millimeters }) => millimeters === bound),
    JSON.stringify(boundaries),
  )

  check('the paper picker follows its right-to-left host', (await picker.evaluate((element) => getComputedStyle(element).direction)) === 'rtl')
}
