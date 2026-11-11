import { expect, test } from 'bun:test'
import { ELEMENT_PROPERTIES, ELEMENT_PROPERTY_DESCRIPTORS, ITEM_SETTINGS_TAG, upgradeProperties } from './element-properties.ts'
import { HEADLESS_ELEMENT_NAMES } from './headless-elements.ts'
import { STYLED_ELEMENT_NAMES } from './styled-elements.ts'

const HTMLElementBase = globalThis.HTMLElement ?? class {}

class ValueElement extends HTMLElementBase {
  private current = 0
  applied = 0

  get value(): number {
    return this.current
  }

  set value(value: number) {
    if (value < 0) throw new RangeError('The value must not be negative.')
    this.current = value
    this.applied++
  }
}

const settle = () => new Promise<void>((resolve) => queueMicrotask(resolve))

test('replay runs after the scheduling call, not during it', async () => {
  const element = new ValueElement()
  Object.defineProperty(element, 'value', { configurable: true, value: 4, writable: true })
  upgradeProperties(element)
  expect(Object.hasOwn(element, 'value')).toBeTrue()
  expect(element.applied).toBe(0)
  await settle()
  expect(element.value).toBe(4)
  expect(Object.hasOwn(element, 'value')).toBeFalse()
})

test('a late own-property set wins before replay', async () => {
  const element = new ValueElement()
  Object.defineProperty(element, 'value', { configurable: true, value: 1, writable: true })
  upgradeProperties(element)
  element.value = 5
  await settle()
  expect(element.value).toBe(5)
})

test('a throwing setter is reported and remaining properties replay', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'reportError')
  const reported: unknown[] = []
  Object.defineProperty(globalThis, 'reportError', { configurable: true, value: (error: unknown) => reported.push(error) })
  try {
    const element = new ValueElement() as ValueElement & { other: number }
    Object.defineProperty(ValueElement.prototype, 'other', {
      configurable: true,
      set(this: { applied: number }) {
        this.applied++
      },
    })
    Object.defineProperty(element, 'value', { configurable: true, value: -1, writable: true })
    Object.defineProperty(element, 'other', { configurable: true, value: 2, writable: true })
    upgradeProperties(element)
    await settle()
    expect(reported).toHaveLength(1)
    expect(reported[0]).toBeInstanceOf(RangeError)
    expect(element.applied).toBe(1)
  } finally {
    Reflect.deleteProperty(ValueElement.prototype, 'other')
    if (previous) Object.defineProperty(globalThis, 'reportError', previous)
    else Reflect.deleteProperty(globalThis, 'reportError')
  }
})

test('only setters defined by the element classes replay', async () => {
  const element = Object.assign(new ValueElement(), { other: 3, title: 'native' })
  upgradeProperties(element)
  await settle()
  expect(element.other).toBe(3)
  expect(Object.hasOwn(element, 'other')).toBeTrue()
  expect(Object.hasOwn(element, 'title')).toBeTrue()
})

test('scheduling twice replays once', async () => {
  const element = new ValueElement()
  Object.defineProperty(element, 'value', { configurable: true, value: 4, writable: true })
  upgradeProperties(element)
  upgradeProperties(element)
  await settle()
  expect(element.applied).toBe(1)
})

test('the table covers every public frame element and safe event name', () => {
  const tags = new Set<string>(ELEMENT_PROPERTY_DESCRIPTORS.map(({ tag }) => tag))
  for (const tag of [...HEADLESS_ELEMENT_NAMES, ...STYLED_ELEMENT_NAMES, ITEM_SETTINGS_TAG]) expect(tags.has(tag)).toBeTrue()
  for (const { events } of ELEMENT_PROPERTY_DESCRIPTORS) {
    for (const name of events) expect(name).not.toMatch(/(?:once|passive|capture)$/i)
  }
  expect(ELEMENT_PROPERTIES.board.properties).toContain('selected')
  expect(ELEMENT_PROPERTIES.board.properties).toContain('origins')
  expect(ELEMENT_PROPERTIES.page.properties).toContain('profile')
  expect(ELEMENT_PROPERTIES.page.events).toEqual(['asof', 'ready', 'preflight', 'fontfailure', 'error', 'composeprogress'])
  expect(ELEMENT_PROPERTIES.paper.events).toEqual(['fontfailure', 'error'])
  expect(ELEMENT_PROPERTIES.book.properties).toContain('profile')
  expect(ELEMENT_PROPERTIES.book.events).toEqual(['preflight', 'fontfailure', 'ready', 'error', 'composeprogress'])
  expect(ELEMENT_PROPERTIES.document.properties).toContain('profile')
  expect(ELEMENT_PROPERTIES.document.events).toEqual(['asof', 'preflight', 'fontfailure', 'error'])
  expect(ELEMENT_PROPERTIES.stage.properties).toContain('profile')
  expect(ELEMENT_PROPERTIES.stage.events).toEqual([
    'segnavia-controller',
    'segnavia-fit',
    'segnavia-frame-mount',
    'segnavia-frame-release',
    'preflight',
    'fontfailure',
    'error',
  ])
})

test('every declared property is an accessor on its element prototype', async () => {
  // Per-class upgrade tests require a real browser because these elements build shadow DOM and frames; they belong to the browser check.
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement')
  Object.defineProperty(globalThis, 'HTMLElement', {
    configurable: true,
    value: class HTMLElement extends EventTarget {
      attachShadow() {
        return { append() {} }
      }
    },
  })
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
        expect(accessor?.set, `${descriptor.tag}.${property}`).toBeFunction()
      }
    }
    const freshStage = Object.create(stage.SegnaviaStage.prototype) as InstanceType<typeof stage.SegnaviaStage>
    expect({
      css: freshStage.css,
      cspExtra: freshStage.cspExtra,
      origins: [...freshStage.origins],
      bridgeReadyTimeoutMs: freshStage.bridgeReadyTimeoutMs,
      frameTitle: freshStage.frameTitle('Deck', 2),
    }).toEqual({ css: '', cspExtra: '', origins: [], bridgeReadyTimeoutMs: 10_000, frameTitle: 'Deck — slide 2' })
  } finally {
    if (previous) Object.defineProperty(globalThis, 'HTMLElement', previous)
    else Reflect.deleteProperty(globalThis, 'HTMLElement')
  }
})
