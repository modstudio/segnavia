import { expect, test } from 'bun:test'
import { PRINTED_PAGE_NUMBER_PATH, PRINTED_PAGE_TOTAL_PATH } from '@segnavia/format'
import { fillBookFurniture } from '@segnavia/html'
import { fillFurniture, markFurnitureOverflow, markRegionOverflow } from './composer-dress.ts'

test('fills a right-to-left Hebrew motif and a printed-page slot in one pass', () => {
  const slot = {
    path: PRINTED_PAGE_NUMBER_PATH,
    removed: false,
    direction: '',
    textContent: '',
    getAttribute(name: string) {
      return name === 'data-slot-value' ? this.path : null
    },
    hasAttribute(name: string) {
      return name === 'dir' && this.direction !== ''
    },
    removeAttribute(name: string) {
      if (name === 'data-slot-value') this.path = ''
    },
    setAttribute(name: string, value: string) {
      if (name === 'dir') this.direction = value
    },
    remove() {
      this.removed = true
    },
  }
  const root = {
    innerHTML: '',
    querySelectorAll: () => [slot],
  } as unknown as Element

  fillFurniture(
    root,
    '<span data-motif="segnavia:running-head"></span><span data-slot-value="printedPage.number"></span>',
    { folio: 'יב', runningHead: 'פרק ראשון', total: 'כ' },
    'rtl',
    'he',
    PRINTED_PAGE_NUMBER_PATH,
    PRINTED_PAGE_TOTAL_PATH,
    fillBookFurniture,
  )

  expect(root.innerHTML).toContain('<bdi dir="rtl">פרק ראשון</bdi>')
  expect(slot).toMatchObject({ direction: 'auto', path: '', removed: false, textContent: 'יב' })
})

test('removes an undefined furniture binding', () => {
  const slot = {
    removed: false,
    getAttribute: () => PRINTED_PAGE_NUMBER_PATH,
    remove() {
      this.removed = true
    },
  }
  const root = { innerHTML: '', querySelectorAll: () => [slot] } as unknown as Element
  fillFurniture(
    root,
    '<span data-slot-value="printedPage.number"></span>',
    {},
    undefined,
    undefined,
    PRINTED_PAGE_NUMBER_PATH,
    PRINTED_PAGE_TOTAL_PATH,
    (html) => html,
  )
  expect(slot.removed).toBeTrue()
})

test('keeps furniture and template-region overflow as separate page facts', () => {
  const attributes = new Map<string, string>()
  const page = { setAttribute: (name: string, value: string) => attributes.set(name, value) } as unknown as Element
  const head = {
    scrollHeight: 31,
    clientHeight: 20,
    hasAttribute: (name: string) => name === 'data-segnavia-head',
    getAttribute: (name: string) => (name === 'data-segnavia-parent' ? 'body' : null),
  } as unknown as HTMLElement
  markFurnitureOverflow(head, page)
  expect(attributes.get('data-segnavia-furniture-overflow')).toBe('body:head:11')
  expect(attributes.has('data-segnavia-region-overflow')).toBeFalse()

  attributes.clear()
  const region = {
    getAttribute: (name: string) => (name === 'data-region' ? 'sidebar' : null),
    setAttribute: (name: string, value: string) => attributes.set(name, value),
  } as unknown as HTMLElement
  const root = { querySelectorAll: () => [region] } as unknown as Element
  markRegionOverflow(root, 'iv', () => ({ block: 11, inline: 0 }))
  expect(attributes.get('data-segnavia-region-overflow')).toBe('iv:sidebar:11')
  expect(attributes.has('data-segnavia-furniture-overflow')).toBeFalse()
})
