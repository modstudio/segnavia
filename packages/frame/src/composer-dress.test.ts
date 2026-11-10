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
    { [PRINTED_PAGE_NUMBER_PATH]: 'יב', [PRINTED_PAGE_TOTAL_PATH]: 'כ' },
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
  fillFurniture(root, '<span data-slot-value="printedPage.number"></span>', {}, undefined, undefined, { [PRINTED_PAGE_NUMBER_PATH]: undefined }, (html) => html)
  expect(slot.removed).toBeTrue()
})

test('collects furniture and template-region overset as separate preflight entries', () => {
  const entries: import('@segnavia/format').PreflightEntry[] = []
  const page = { getAttribute: (name: string) => (name === 'data-segnavia-folio' ? 'iv' : null) } as unknown as Element
  const head = {
    scrollHeight: 31,
    clientHeight: 20,
    hasAttribute: (name: string) => name === 'data-segnavia-head',
    getAttribute: (name: string) => (name === 'data-segnavia-parent' ? 'body' : null),
  } as unknown as HTMLElement
  markFurnitureOverflow(head, page, entries)
  expect(entries[0]).toMatchObject({ check: 'furniture-overset', subject: 'body:head', location: { folio: 'iv' } })

  const region = {
    getAttribute: (name: string) => (name === 'data-region' ? 'sidebar' : null),
  } as unknown as HTMLElement
  const root = { querySelectorAll: () => [region], getAttribute: (name: string) => (name === 'data-template' ? 'lesson' : null) } as unknown as Element
  markRegionOverflow(root, 'iv', () => ({ block: 11, inline: 0 }), entries)
  expect(entries[1]).toMatchObject({ check: 'region-overset', subject: 'lesson:sidebar', location: { folio: 'iv' } })
})
