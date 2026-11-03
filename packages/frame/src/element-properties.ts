import { HEADLESS_ELEMENTS } from './headless-elements.ts'
import { STYLED_ELEMENTS } from './styled-elements.ts'

export interface ElementDescriptor<
  Tag extends `segnavia-${string}` = `segnavia-${string}`,
  Property extends string = string,
  Event extends string = string,
> {
  tag: Tag
  properties: readonly Property[]
  events: Readonly<Record<Event, `on${string}`>>
}

const descriptor = <Tag extends `segnavia-${string}`, Property extends string, Event extends string>(
  tag: Tag,
  properties: readonly Property[],
  events: Readonly<Record<Event, `on${string}`>>,
): ElementDescriptor<Tag, Property, Event> => ({ tag, properties, events })

const controlProperties = ['controller', 'labels'] as const

export const ELEMENT_PROPERTIES = {
  stage: descriptor(
    HEADLESS_ELEMENTS.stage,
    ['controller', 'css', 'cspExtra', 'dependencyOrigins', 'bridgeReadyTimeoutMs', 'frameTitle', 'transition', 'reserve', 'slots'],
    { 'segnavia-controller': 'onSegnaviaController', 'segnavia-fit': 'onSegnaviaFit' },
  ),
  thumbnail: descriptor(
    HEADLESS_ELEMENTS.thumbnail,
    ['deck', 'page', 'print', 'index', 'resolveSlide', 'base', 'css', 'mountMargin', 'slots', 'motifs', 'fonts', 'placements', 'designedCover', 'pageWidths'],
    { 'segnavia-thumbnail-error': 'onSegnaviaThumbnailError' },
  ),
  board: descriptor(
    HEADLESS_ELEMENTS.board,
    ['board', 'motifs', 'placements', 'pageWidths', 'fonts', 'view', 'kindIcon', 'selection', 'selected', 'itemActions', 'labels', 'liveWidth', 'resolveItem', 'itemNames'],
    {
      'segnavia-board-change': 'onSegnaviaBoardChange',
      'segnavia-board-error': 'onSegnaviaBoardError',
      'segnavia-board-icons': 'onSegnaviaBoardIcons',
      'segnavia-board-item-action': 'onSegnaviaBoardItemAction',
      'segnavia-board-names': 'onSegnaviaBoardNames',
      'segnavia-board-open': 'onSegnaviaBoardOpen',
      'segnavia-board-selection': 'onSegnaviaBoardSelection',
      'segnavia-board-view': 'onSegnaviaBoardView',
    },
  ),
  boardList: descriptor(HEADLESS_ELEMENTS.boardList, ['target', 'searchItems', 'labels'], {
    'segnavia-board-search-error': 'onSegnaviaBoardSearchError',
    'segnavia-board-select': 'onSegnaviaBoardSelect',
  }),
  boardToolbar: descriptor(HEADLESS_ELEMENTS.boardToolbar, ['target', 'list', 'shareable', 'labels'], {
    'segnavia-board-list-toggle': 'onSegnaviaBoardListToggle',
    'segnavia-board-share': 'onSegnaviaBoardShare',
  }),
  page: descriptor(HEADLESS_ELEMENTS.page, ['page', 'css', 'cspExtra', 'dependencyOrigins', 'slots', 'motifs', 'fonts', 'alertLabels', 'placements', 'pageWidths'], {}),
  paper: descriptor(HEADLESS_ELEMENTS.paper, ['paper', 'side', 'css', 'cspExtra', 'dependencyOrigins', 'slots', 'motifs', 'fonts', 'placements', 'pageWidths'], {}),
  document: descriptor(HEADLESS_ELEMENTS.document, ['css', 'cspExtra', 'dependencyOrigins', 'pages', 'print', 'slots', 'motifs', 'fonts', 'placements', 'pageWidths'], {}),
  book: descriptor(HEADLESS_ELEMENTS.book, ['view', 'fonts', 'motifs', 'placements', 'pageWidths', 'dependencyOrigins'], {}),
  player: descriptor(
    STYLED_ELEMENTS.player,
    ['labels', 'css', 'cspExtra', 'dependencyOrigins', 'resolveSlide', 'placements', 'transition', 'slots'],
    { 'segnavia-labels': 'onSegnaviaLabels' },
  ),
  play: descriptor(STYLED_ELEMENTS.play, controlProperties, {}),
  step: descriptor(STYLED_ELEMENTS.step, controlProperties, {}),
  track: descriptor(STYLED_ELEMENTS.track, controlProperties, {}),
  counter: descriptor(STYLED_ELEMENTS.counter, controlProperties, {}),
  time: descriptor(STYLED_ELEMENTS.time, controlProperties, {}),
  mute: descriptor(STYLED_ELEMENTS.mute, controlProperties, {}),
  captions: descriptor(STYLED_ELEMENTS.captions, controlProperties, {}),
  caption: descriptor(STYLED_ELEMENTS.caption, controlProperties, {}),
  notes: descriptor(STYLED_ELEMENTS.notes, controlProperties, {}),
  fullscreen: descriptor(STYLED_ELEMENTS.fullscreen, [...controlProperties, 'targetElement'], {}),
  rail: descriptor(STYLED_ELEMENTS.rail, [...controlProperties, 'mountMargin'], {}),
  paperPicker: descriptor(STYLED_ELEMENTS.paperPicker, ['value', 'labels'], { change: 'onChange' }),
  itemSettings: descriptor('segnavia-item-settings', ['declarations', 'fills', 'fill', 'source', 'report', 'labels'], {
    'segnavia-fill-select': 'onSegnaviaFillSelect',
  }),
} as const

export const ELEMENT_PROPERTY_DESCRIPTORS: readonly ElementDescriptor[] = Object.values(ELEMENT_PROPERTIES)

export function upgradeProperties(element: object, names: readonly string[]): void {
  for (const name of names) {
    if (!Object.prototype.hasOwnProperty.call(element, name)) continue
    const value = Reflect.get(element, name)
    if (!Reflect.deleteProperty(element, name)) throw new TypeError(`Could not upgrade the ${name} property.`)
    Reflect.set(element, name, value)
  }
}
