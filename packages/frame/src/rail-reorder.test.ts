import { describe, expect, test } from 'bun:test'
import { RailReorder, type RailReorderIntent } from './rail-reorder.ts'

function setup(horizontal = false, direction: 'ltr' | 'rtl' = 'ltr') {
  const buttons = [0, 1, 2].map((index) => ({ dataset: { index: String(index) }, draggable: false, removeAttribute() {} }))
  const target = (index: number, excluded = false) => ({
    excluded,
    closest: (selector: string) => (excluded || selector !== 'button[data-index]' ? null : buttons[index]),
  })
  const reorder = new RailReorder({
    root: new EventTarget() as ShadowRoot,
    count: () => buttons.length,
    horizontal: () => horizontal,
    direction: () => direction,
    buttons: () => buttons as unknown as HTMLButtonElement[],
    excludes: (element) => Boolean((element as Element & { excluded?: boolean }).excluded),
  })
  return { buttons, reorder, target }
}

describe('rail reorder interaction', () => {
  test('enablement updates every reorder handle', () => {
    const { buttons, reorder } = setup()
    reorder.setEnabled(true)
    expect(buttons.map((button) => button.draggable)).toEqual([true, true, true])
    reorder.setEnabled(false)
    expect(buttons.map((button) => button.draggable)).toEqual([false, false, false])
  })

  test('Alt+Arrow dispatches one shared reorder intent', () => {
    const { reorder, target } = setup()
    const intents: RailReorderIntent[] = []
    reorder.subscribe((intent) => intents.push(intent))
    reorder.setEnabled(true)
    let prevented = false
    const event = {
      target: target(1),
      key: 'ArrowDown',
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      preventDefault: () => (prevented = true),
    } as unknown as KeyboardEvent

    ;(reorder as unknown as { keydown(event: KeyboardEvent): void }).keydown(event)

    expect(intents).toEqual([{ fromIndex: 1, toIndex: 2 }])
    expect(prevented).toBe(true)
  })

  test('target exclusions keep nested controls out of keyboard reorder', () => {
    const { reorder, target } = setup()
    const intents: RailReorderIntent[] = []
    reorder.subscribe((intent) => intents.push(intent))
    reorder.setEnabled(true)
    const event = {
      target: target(1, true),
      key: 'ArrowDown',
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      preventDefault() {},
    } as unknown as KeyboardEvent

    ;(reorder as unknown as { keydown(event: KeyboardEvent): void }).keydown(event)

    expect(intents).toEqual([])
  })
})
