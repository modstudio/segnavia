import { expect, test } from 'bun:test'
import { PRINTED_PAGE_NUMBER_PATH, PRINTED_PAGE_TOTAL_PATH } from '@segnavia/format'
import { fillBookFurniture } from '@segnavia/html'
import { fillFurniture } from './composer-dress.ts'

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
