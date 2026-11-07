import { ELEMENT_PROPERTIES, ELEMENT_PROPERTY_DESCRIPTORS } from '@segnavia/frame/element-properties'
import { parseDocument } from '@segnavia/html'
import { createApp, h } from 'vue'
import { DeckController } from '../packages/frame/src/controller.ts'
import { MARKDOWN_EDITOR_PROPERTIES } from '../packages/markdown-editor/src/element-properties.ts'

const deck = parseDocument({
  type: 'document' as const,
  kind: 'deck' as const,
  title: 'Vue deck',
  children: [{ type: 'slide' as const, id: 'vue-slide', content: { kind: 'html' as const, html: '<h1>Vue rendered slide</h1>' } }],
})
const controller = new DeckController({ persist: false })
await controller.load(deck)

const facts = {
  events: [] as Array<{ name: string; detail: unknown }>,
  lateReplay: {} as Record<string, { instance: boolean; ownProperty: boolean; value: boolean; effect?: boolean }>,
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
const replayRoot = document.createElement('div')
document.body.append(replayRoot)
for (const descriptor of ELEMENT_PROPERTY_DESCRIPTORS) {
  if (descriptor.tag === ELEMENT_PROPERTIES.stage.tag || descriptor.tag === ELEMENT_PROPERTIES.thumbnail.tag) continue
  const key = Object.entries(ELEMENT_PROPERTIES).find(([, candidate]) => candidate === descriptor)?.[0] as keyof typeof replayValues | undefined
  const replay = key ? replayValues[key] : undefined
  if (!replay || !descriptor.properties.includes(replay[0] as never)) throw new Error(`No late property replay value for ${descriptor.tag}.`)
  const element = document.createElement(descriptor.tag)
  Reflect.set(element, replay[0], replay[1])
  replayRoot.append(element)
  replayElements.set(descriptor.tag, { element, property: replay[0], value: replay[1] })
}

const upgradingEditor = document.createElement(MARKDOWN_EDITOR_PROPERTIES.tag)
upgradingEditor.setAttribute('title', 'Title present at upgrade')
Reflect.set(upgradingEditor, 'mode', 'source')
Reflect.set(upgradingEditor, 'markdown', '# Replayed markdown')
upgradingEditor.addEventListener('segnavia-editor-state', event('editor-state'))
document.body.append(upgradingEditor)

await import('@segnavia/frame')
await import('@segnavia/frame/controls')
await import('@segnavia/frame/player')
await import('@segnavia/frame/item-settings')
await import('@segnavia/markdown-editor')
await Promise.resolve()

createApp({ render: () => h('div', vueElements(false)) }).mount('#early-root')

const replayValueMatches = (actual: unknown, expected: unknown): boolean => {
  if (Object.is(actual, expected)) return true
  if (typeof actual !== 'object' || actual === null || typeof expected !== 'object' || expected === null) return false
  return Object.entries(expected).every(([key, value]) => replayValueMatches(Reflect.get(actual, key), value))
}
const replayFact = (element: HTMLElement, property: string, value: unknown, effect?: boolean) => ({
  instance: element instanceof (customElements.get(element.localName) as CustomElementConstructor),
  ownProperty: Object.hasOwn(element, property),
  value: replayValueMatches(Reflect.get(element, property), value),
  ...(effect === undefined ? {} : { effect }),
})
for (const [tag, replay] of replayElements) {
  const effect =
    tag === ELEMENT_PROPERTIES.paperPicker.tag ? replay.element.shadowRoot?.textContent?.includes((replay.value as { paper: string }).paper) : undefined
  facts.lateReplay[tag] = replayFact(replay.element, replay.property, replay.value, effect)
}
const lateStage = document.querySelector('#late-stage') as HTMLElement
const lateThumbnail = document.querySelector('#late-thumbnail') as HTMLElement
facts.lateReplay[ELEMENT_PROPERTIES.stage.tag] = replayFact(lateStage, 'controller', controller)
facts.lateReplay[ELEMENT_PROPERTIES.thumbnail.tag] = replayFact(lateThumbnail, 'deck', deck)
facts.lateReplay[MARKDOWN_EDITOR_PROPERTIES.tag] = replayFact(
  upgradingEditor,
  'markdown',
  '# Replayed markdown',
  upgradingEditor.shadowRoot?.textContent?.includes('Replayed markdown'),
)

facts.titles.upgrade = { title: Reflect.get(upgradingEditor, 'title'), attribute: upgradingEditor.getAttribute('title') }
upgradingEditor.setAttribute('title', 'Title set after upgrade')
facts.titles.afterAttribute = { title: Reflect.get(upgradingEditor, 'title'), attribute: upgradingEditor.getAttribute('title') }
upgradingEditor.removeAttribute('title')
facts.titles.afterRemoval = Reflect.get(upgradingEditor, 'title')
Reflect.set(upgradingEditor, 'title', 'Title set as property')
facts.titles.afterProperty = { title: Reflect.get(upgradingEditor, 'title'), attribute: upgradingEditor.getAttribute('title') }

Object.assign(window, { vueFacts: facts })
