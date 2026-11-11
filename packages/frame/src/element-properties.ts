import { HEADLESS_ELEMENTS } from './headless-elements.ts'
import { STYLED_ELEMENTS } from './styled-elements.ts'

export const ITEM_SETTINGS_TAG = 'segnavia-item-settings'

export interface ElementPropertyTable<
  Tag extends `segnavia-${string}` = `segnavia-${string}`,
  Property extends string = string,
  DomEventName extends string = string,
> {
  tag: Tag
  properties: readonly Property[]
  events: readonly DomEventName[]
}

const descriptor = <Tag extends `segnavia-${string}`, Property extends string, DomEventName extends string>(
  tag: Tag,
  properties: readonly Property[],
  events: readonly DomEventName[],
): ElementPropertyTable<Tag, Property, DomEventName> => ({ tag, properties, events })

const controlProperties = ['controller', 'labels'] as const

export const ELEMENT_PROPERTIES = {
  stage: descriptor(
    HEADLESS_ELEMENTS.stage,
    ['controller', 'css', 'cspExtra', 'origins', 'bridgeReadyTimeoutMs', 'frameTitle', 'transition', 'reserve', 'slots', 'brands', 'profile'],
    ['segnavia-controller', 'segnavia-fit', 'segnavia-frame-mount', 'segnavia-frame-release', 'preflight', 'fontfailure'],
  ),
  thumbnail: descriptor(
    HEADLESS_ELEMENTS.thumbnail,
    [
      'deck',
      'page',
      'print',
      'index',
      'resolveSlide',
      'base',
      'css',
      'origins',
      'mountMargin',
      'slots',
      'motifs',
      'fonts',
      'brands',
      'placements',
      'designedCover',
      'pageWidths',
    ],
    ['segnavia-thumbnail-error'],
  ),
  board: descriptor(
    HEADLESS_ELEMENTS.board,
    [
      'board',
      'motifs',
      'placements',
      'pageWidths',
      'fonts',
      'origins',
      'brands',
      'view',
      'kindIcon',
      'selection',
      'selected',
      'itemActions',
      'labels',
      'liveWidth',
      'resolveItem',
      'itemNames',
    ],
    [
      'segnavia-board-change',
      'segnavia-board-error',
      'segnavia-board-icons',
      'segnavia-board-item-action',
      'segnavia-board-names',
      'segnavia-board-open',
      'segnavia-board-selection',
      'segnavia-board-view',
    ],
  ),
  boardList: descriptor(HEADLESS_ELEMENTS.boardList, ['target', 'searchItems', 'labels'], ['segnavia-board-search-error', 'segnavia-board-select']),
  boardToolbar: descriptor(HEADLESS_ELEMENTS.boardToolbar, ['target', 'list', 'shareable', 'labels'], ['segnavia-board-list-toggle', 'segnavia-board-share']),
  page: descriptor(
    HEADLESS_ELEMENTS.page,
    [
      'page',
      'css',
      'cspExtra',
      'origins',
      'slots',
      'motifs',
      'fonts',
      'brands',
      'alertLabels',
      'placements',
      'pageWidths',
      'anchors',
      'asOf',
      'moment',
      'profile',
    ],
    ['asof', 'ready', 'preflight', 'fontfailure'],
  ),
  paper: descriptor(
    HEADLESS_ELEMENTS.paper,
    ['paper', 'side', 'css', 'cspExtra', 'origins', 'slots', 'motifs', 'fonts', 'brands', 'placements', 'pageWidths'],
    [],
  ),
  document: descriptor(
    HEADLESS_ELEMENTS.document,
    ['css', 'cspExtra', 'origins', 'pages', 'print', 'slots', 'motifs', 'fonts', 'brands', 'placements', 'pageWidths', 'anchors', 'asOf', 'moment', 'profile'],
    ['asof', 'preflight', 'fontfailure'],
  ),
  book: descriptor(HEADLESS_ELEMENTS.book, ['view', 'fonts', 'motifs', 'placements', 'pageWidths', 'origins', 'profile'], ['preflight', 'fontfailure']),
  player: descriptor(
    STYLED_ELEMENTS.player,
    ['labels', 'css', 'cspExtra', 'origins', 'resolveSlide', 'placements', 'transition', 'slots'],
    ['segnavia-labels'],
  ),
  play: descriptor(STYLED_ELEMENTS.play, controlProperties, []),
  step: descriptor(STYLED_ELEMENTS.step, controlProperties, []),
  track: descriptor(STYLED_ELEMENTS.track, controlProperties, []),
  counter: descriptor(STYLED_ELEMENTS.counter, controlProperties, []),
  time: descriptor(STYLED_ELEMENTS.time, controlProperties, []),
  mute: descriptor(STYLED_ELEMENTS.mute, controlProperties, []),
  captions: descriptor(STYLED_ELEMENTS.captions, controlProperties, []),
  caption: descriptor(STYLED_ELEMENTS.caption, controlProperties, []),
  notes: descriptor(STYLED_ELEMENTS.notes, controlProperties, []),
  fullscreen: descriptor(STYLED_ELEMENTS.fullscreen, [...controlProperties, 'targetElement'], []),
  rail: descriptor(STYLED_ELEMENTS.rail, [...controlProperties, 'mountMargin'], []),
  paperPicker: descriptor(STYLED_ELEMENTS.paperPicker, ['value', 'labels'], ['change']),
  itemSettings: descriptor(
    ITEM_SETTINGS_TAG,
    ['declarations', 'fills', 'fill', 'overrides', 'source', 'report', 'labels', 'controls'],
    ['segnavia-fill-select', 'segnavia-fill-input'],
  ),
} as const

export const ELEMENT_PROPERTY_DESCRIPTORS: readonly ElementPropertyTable[] = Object.values(ELEMENT_PROPERTIES)

const scheduled = new WeakSet<object>()

function report(error: unknown): void {
  if ('reportError' in globalThis && typeof globalThis.reportError === 'function') globalThis.reportError(error)
  else
    queueMicrotask(() => {
      throw error
    })
}

function setterNames(element: object): string[] {
  const names = new Set<string>()
  const nativePrototype = globalThis.HTMLElement?.prototype ?? Object.prototype
  for (let prototype = Object.getPrototypeOf(element); prototype && prototype !== nativePrototype; prototype = Object.getPrototypeOf(prototype)) {
    for (const name of Object.getOwnPropertyNames(prototype)) if (Object.getOwnPropertyDescriptor(prototype, name)?.set) names.add(name)
  }
  return [...names]
}

export function upgradeProperties(element: object): void {
  if (scheduled.has(element)) return
  scheduled.add(element)
  queueMicrotask(() => {
    for (const name of setterNames(element)) {
      if (!Object.hasOwn(element, name)) continue
      const value = Reflect.get(element, name)
      if (!Reflect.deleteProperty(element, name)) {
        report(new TypeError(`Could not upgrade the ${name} property.`))
        continue
      }
      try {
        Reflect.set(element, name, value)
      } catch (error) {
        report(error)
      }
    }
  })
}
