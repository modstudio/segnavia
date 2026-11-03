import { expect, test } from 'bun:test'
import { ELEMENT_PROPERTIES, ELEMENT_PROPERTY_DESCRIPTORS, upgradeProperties } from './element-properties.ts'
import { HEADLESS_ELEMENT_NAMES } from './headless-elements.ts'
import { STYLED_ELEMENT_NAMES } from './styled-elements.ts'

class ValueElement {
  private current = 0

  get value(): number {
    return this.current
  }

  set value(value: number) {
    if (value < 0) throw new RangeError('The value must not be negative.')
    this.current = value
  }
}

test('owned properties replay through their accessors', () => {
  const element = new ValueElement()
  Object.defineProperty(element, 'value', { configurable: true, value: 4, writable: true })
  upgradeProperties(element, ['value'])
  expect(element.value).toBe(4)
  expect(Object.hasOwn(element, 'value')).toBeFalse()
})

test('replayed properties receive the same refusal as a late assignment', () => {
  const late = new ValueElement()
  expect(() => {
    late.value = -1
  }).toThrow('The value must not be negative.')

  const early = new ValueElement()
  Object.defineProperty(early, 'value', { configurable: true, value: -1, writable: true })
  expect(() => upgradeProperties(early, ['value'])).toThrow('The value must not be negative.')
})

test('unlisted owned properties stay untouched', () => {
  const element = Object.assign(new ValueElement(), { other: 3 })
  upgradeProperties(element, ['value'])
  expect(element.other).toBe(3)
  expect(Object.hasOwn(element, 'other')).toBeTrue()
})

test('the table covers every public frame element and safe event name', () => {
  const tags = new Set<string>(ELEMENT_PROPERTY_DESCRIPTORS.map(({ tag }) => tag))
  for (const tag of [...HEADLESS_ELEMENT_NAMES, ...STYLED_ELEMENT_NAMES, 'segnavia-item-settings']) expect(tags.has(tag)).toBeTrue()
  for (const { events } of ELEMENT_PROPERTY_DESCRIPTORS) {
    for (const name of Object.keys(events)) expect(name).not.toMatch(/(?:once|passive|capture)$/i)
  }
  expect(ELEMENT_PROPERTIES.board.properties).toContain('selected')
})

test('every declared property is an accessor on its element prototype', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement')
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: class HTMLElement extends EventTarget {} })
  try {
    const [stage, thumbnail, board, boardList, boardToolbar, page, paper, document, book, player, controls, caption, rail, paperPicker, itemSettings] =
      await Promise.all([
        import('./stage.ts'),
        import('./thumbnail.ts'),
        import('./board.ts'),
        import('./board-list.ts'),
        import('./board-toolbar.ts'),
        import('./page.ts'),
        import('./paper.ts'),
        import('./document.ts'),
        import('./book.ts'),
        import('./player.ts'),
        import('./controls.ts'),
        import('./caption.ts'),
        import('./rail.ts'),
        import('./paper-picker.ts'),
        import('./item-settings-element.ts'),
      ])
    const classes: Record<string, { prototype: object }> = {
      stage: stage.SegnaviaStage,
      thumbnail: thumbnail.SegnaviaThumbnail,
      board: board.SegnaviaBoard,
      boardList: boardList.SegnaviaBoardList,
      boardToolbar: boardToolbar.SegnaviaBoardToolbar,
      page: page.SegnaviaPage,
      paper: paper.SegnaviaPaper,
      document: document.SegnaviaDocument,
      book: book.SegnaviaBook,
      player: player.SegnaviaPlayer,
      play: controls.SegnaviaPlay,
      step: controls.SegnaviaStep,
      track: controls.SegnaviaTrack,
      counter: controls.SegnaviaCounter,
      time: controls.SegnaviaTime,
      mute: controls.SegnaviaMute,
      captions: controls.SegnaviaCaptions,
      caption: caption.SegnaviaCaption,
      notes: caption.SegnaviaNotes,
      fullscreen: controls.SegnaviaFullscreen,
      rail: rail.SegnaviaRail,
      paperPicker: paperPicker.SegnaviaPaperPicker,
      itemSettings: itemSettings.SegnaviaItemSettings,
    }
    for (const [key, descriptor] of Object.entries(ELEMENT_PROPERTIES)) {
      for (const property of descriptor.properties) {
        let prototype: object | null = classes[key]?.prototype ?? null
        let accessor: PropertyDescriptor | undefined
        while (prototype && !accessor) {
          accessor = Object.getOwnPropertyDescriptor(prototype, property)
          prototype = Object.getPrototypeOf(prototype)
        }
        expect(accessor?.get || accessor?.set, `${descriptor.tag}.${property}`).toBeFunction()
      }
    }
    const freshStage = Object.create(stage.SegnaviaStage.prototype) as InstanceType<typeof stage.SegnaviaStage>
    expect({
      css: freshStage.css,
      cspExtra: freshStage.cspExtra,
      dependencyOrigins: [...freshStage.dependencyOrigins],
      bridgeReadyTimeoutMs: freshStage.bridgeReadyTimeoutMs,
      frameTitle: freshStage.frameTitle('Deck', 2),
    }).toEqual({ css: '', cspExtra: '', dependencyOrigins: [], bridgeReadyTimeoutMs: 10_000, frameTitle: 'Deck — slide 2' })
  } finally {
    if (previous) Object.defineProperty(globalThis, 'HTMLElement', previous)
    else Reflect.deleteProperty(globalThis, 'HTMLElement')
  }
})
