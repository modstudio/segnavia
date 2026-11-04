import { ELEMENT_PROPERTIES, ELEMENT_PROPERTY_DESCRIPTORS } from '@segnavia/frame/element-properties'
import { createApp, h } from 'vue'
import { DeckController } from '../packages/frame/src/controller.ts'
import { MARKDOWN_EDITOR_PROPERTIES } from '../packages/markdown-editor/src/element-properties.ts'

const deck = {
  title: 'Vue deck',
  slides: [{ id: 'vue-slide', content: { kind: 'html' as const, html: '<h1>Vue rendered slide</h1>' } }],
}
const controller = new DeckController({ persist: false })
await controller.load(deck)

const facts = {
  events: [] as Array<{ name: string; detail: unknown }>,
  lateReplay: {} as Record<string, boolean>,
  weakReplayTags: [] as string[],
  titles: {} as Record<string, unknown>,
}

const event = (name: string) => (value: Event) => {
  facts.events.push({ name, detail: (value as CustomEvent).detail })
}
const vueElements = (late: boolean) => [
  h('segnavia-stage', {
    id: `${late ? 'late' : 'early'}-stage`,
    [late ? '.controller' : 'controller']: controller,
    onSegnaviaFit: event(`${late ? 'late' : 'early'}-stage-fit`),
  }),
  h('segnavia-thumbnail', {
    id: `${late ? 'late' : 'early'}-thumbnail`,
    [late ? '.deck' : 'deck']: deck,
  }),
  h('segnavia-thumbnail', {
    id: `${late ? 'late' : 'early'}-error-thumbnail`,
    [late ? '.deck' : 'deck']: deck,
    [late ? '.resolveSlide' : 'resolveSlide']: async () => {
      throw new Error('Vue thumbnail event detail')
    },
    onSegnaviaThumbnailError: event(`${late ? 'late' : 'early'}-thumbnail-error`),
  }),
  h('segnavia-markdown-editor', {
    id: `${late ? 'late' : 'early'}-editor`,
    mode: 'source',
    onSegnaviaEditorState: event(`${late ? 'late' : 'early'}-editor-state`),
  }),
]

createApp({ render: () => h('div', vueElements(true)) }).mount('#late-root')

const replayValues = {
  board: ['labels', { board: 'Board' }],
  boardList: ['labels', { search: 'Find' }],
  boardToolbar: ['labels', { share: 'Share' }],
  page: ['css', ':root{--vue-replay:page}'],
  paper: ['css', ':root{--vue-replay:paper}'],
  document: ['css', ':root{--vue-replay:document}'],
  book: ['pageWidths', { standard: 777, wide: 999 }],
  player: ['labels', { player: 'Vue player' }],
  play: ['labels', { play: 'Vue play' }],
  step: ['labels', { next: 'Vue next' }],
  track: ['labels', { seek: 'Vue seek' }],
  counter: ['labels', { counter: 'Vue counter' }],
  time: ['labels', { time: 'Vue time' }],
  mute: ['labels', { mute: 'Vue mute' }],
  captions: ['labels', { captions: 'Vue captions' }],
  caption: ['labels', { caption: 'Vue caption' }],
  notes: ['labels', { notes: 'Vue notes' }],
  fullscreen: ['targetElement', null],
  rail: ['mountMargin', 321],
  paperPicker: ['labels', { paper: 'Vue paper' }],
  itemSettings: ['labels', { fields: 'Vue fields' }],
} as const satisfies Record<Exclude<keyof typeof ELEMENT_PROPERTIES, 'stage' | 'thumbnail'>, readonly [string, unknown]>

const replayElements = new Map<string, { element: HTMLElement; property: string; value: unknown }>()
for (const descriptor of ELEMENT_PROPERTY_DESCRIPTORS) {
  if (descriptor.tag === ELEMENT_PROPERTIES.stage.tag || descriptor.tag === ELEMENT_PROPERTIES.thumbnail.tag) continue
  const key = Object.entries(ELEMENT_PROPERTIES).find(([, candidate]) => candidate === descriptor)?.[0] as keyof typeof replayValues | undefined
  const replay = key ? replayValues[key] : undefined
  if (!replay || !descriptor.properties.includes(replay[0] as never)) throw new Error(`No late property replay value for ${descriptor.tag}.`)
  const element = document.createElement(descriptor.tag)
  Reflect.set(element, replay[0], replay[1])
  replayElements.set(descriptor.tag, { element, property: replay[0], value: replay[1] })
}

const upgradingEditor = document.createElement(MARKDOWN_EDITOR_PROPERTIES.tag)
upgradingEditor.setAttribute('title', 'Title present at upgrade')
upgradingEditor.setAttribute('mode', 'source')
upgradingEditor.addEventListener('segnavia-editor-state', event('editor-state'))
document.body.append(upgradingEditor)

await import('@segnavia/frame')
await import('@segnavia/frame/controls')
await import('@segnavia/frame/player')
await import('@segnavia/frame/item-settings')
await import('@segnavia/markdown-editor')
await Promise.resolve()

createApp({ render: () => h('div', vueElements(false)) }).mount('#early-root')

for (const [tag, replay] of replayElements) {
  facts.lateReplay[tag] = Object.is(Reflect.get(replay.element, replay.property), replay.value)
  facts.weakReplayTags.push(tag)
}
facts.lateReplay[ELEMENT_PROPERTIES.stage.tag] = (document.querySelector('#late-stage') as { controller?: unknown } | null)?.controller === controller
facts.lateReplay[ELEMENT_PROPERTIES.thumbnail.tag] =
  (document.querySelector('#late-thumbnail') as { deck?: { title?: unknown } } | null)?.deck?.title === deck.title
facts.lateReplay[MARKDOWN_EDITOR_PROPERTIES.tag] = Reflect.get(upgradingEditor, 'title') === 'Title present at upgrade'

facts.titles.upgrade = { title: Reflect.get(upgradingEditor, 'title'), attribute: upgradingEditor.getAttribute('title') }
upgradingEditor.setAttribute('title', 'Title set after upgrade')
facts.titles.afterAttribute = { title: Reflect.get(upgradingEditor, 'title'), attribute: upgradingEditor.getAttribute('title') }
upgradingEditor.removeAttribute('title')
facts.titles.afterRemoval = Reflect.get(upgradingEditor, 'title')
Reflect.set(upgradingEditor, 'title', 'Title set as property')
facts.titles.afterProperty = { title: Reflect.get(upgradingEditor, 'title'), attribute: upgradingEditor.getAttribute('title') }

Object.assign(window, { vueFacts: facts })
