import { expect, test } from 'bun:test'
import { NodeSelection } from '@tiptap/pm/state'
import { ENGLISH_MARKDOWN_EDITOR_LABELS } from './markdown-editor-labels.ts'
import { labelRawInline, type RawInlineIndicationDetail, RawInlineIndicator, selectedRawInlineAtom } from './markdown-raw-inline-indication.ts'
import { RAW_INLINE_ATTRIBUTE, RAW_INLINE_DISPLAY_ATTRIBUTE, RAW_INLINE_NAME, RAW_INLINE_SOURCE_ATTRIBUTE } from './markdown-rich-raw-inline.ts'

function atom(source = '[מוצג][מקור]', display = 'מוצג', parentElement: Element | null = null) {
  const attributes = new Map<string, string>([
    [RAW_INLINE_ATTRIBUTE, ''],
    [RAW_INLINE_SOURCE_ATTRIBUTE, source],
    [RAW_INLINE_DISPLAY_ATTRIBUTE, display],
  ])
  const value = {
    closest: () => value,
    getBoundingClientRect: () => ({ x: 1, y: 2, width: 3, height: 4 }),
    getAttribute: (name: string) => attributes.get(name) ?? null,
    getRootNode: () => value,
    hasAttribute: (name: string) => attributes.has(name),
    parentElement,
    setAttribute: (name: string, content: string) => attributes.set(name, content),
  }
  return value as unknown as HTMLElement
}

test('raw-inline accessibility names the display and isolated source without a title', () => {
  const element = atom()
  labelRawInline(element, ENGLISH_MARKDOWN_EDITOR_LABELS)
  expect(element.hasAttribute('title')).toBeFalse()
  expect(element.getAttribute('role')).toBe('img')
  expect(element.getAttribute('aria-label')).toContain('מוצג')
  expect(element.getAttribute('aria-label')).toContain('[מוצג][מקור]')
  expect(element.getAttribute('aria-label')).toContain('\u2067')
})

test('a neutral source uses the inherited RTL direction in its accessible name', () => {
  const context = { getAttribute: (name: string) => (name === 'dir' ? 'rtl' : null), getRootNode: () => context, parentElement: null }
  const element = atom('&amp;', '&', context as unknown as Element)
  labelRawInline(element, ENGLISH_MARKDOWN_EDITOR_LABELS)
  expect(element.getAttribute('aria-label')).toContain('\u2067&amp;\u2069')
})

test('pointer indication enters, suppresses an identical state, and leaves', () => {
  const events: Array<RawInlineIndicationDetail | null> = []
  const indicator = new RawInlineIndicator((detail) => events.push(detail))
  const element = atom()
  indicator.pointerEnter(element)
  indicator.pointerEnter(element)
  indicator.pointerLeave(element)
  expect(events).toEqual([{ source: '[מוצג][מקור]', display: 'מוצג', rect: { x: 1, y: 2, width: 3, height: 4 }, via: 'pointer' }, null])
})

test('a raw-inline node selection is found and leaving it clears', () => {
  const element = atom()
  const selection = Object.create(NodeSelection.prototype) as NodeSelection
  Object.defineProperties(selection, {
    from: { value: 5 },
    node: { value: { type: { name: RAW_INLINE_NAME } } },
  })
  const editor = { state: { selection }, view: { nodeDOM: () => element } }
  expect(selectedRawInlineAtom(editor)).toBe(element)
  const events: Array<RawInlineIndicationDetail | null> = []
  const indicator = new RawInlineIndicator((detail) => events.push(detail))
  indicator.selectionSelect(selectedRawInlineAtom(editor))
  indicator.selectionSelect(null)
  expect(events.map((event) => event?.via ?? null)).toEqual(['selection', null])
})

test('selection indication wins while pointer indication continues to hold', () => {
  const events: Array<RawInlineIndicationDetail | null> = []
  const indicator = new RawInlineIndicator((detail) => events.push(detail))
  const pointer = atom('pointer', 'Pointer')
  const selection = atom('selection', 'Selection')
  indicator.pointerEnter(pointer)
  indicator.selectionSelect(selection)
  indicator.pointerEnter(atom('moved', 'Moved'))
  indicator.selectionSelect(null)
  expect(events.map((event) => event?.source ?? null)).toEqual(['pointer', 'selection', 'moved'])
  expect(events.map((event) => event?.via ?? null)).toEqual(['pointer', 'selection', 'pointer'])
})

test('destroying a hovered node view ends its pointer indication', () => {
  const events: Array<RawInlineIndicationDetail | null> = []
  const indicator = new RawInlineIndicator((detail) => events.push(detail))
  const element = atom()
  indicator.pointerEnter(element)
  const view = { destroy: () => indicator.pointerLeave(element) }
  view.destroy()
  expect(events.at(-1)).toBeNull()
})
