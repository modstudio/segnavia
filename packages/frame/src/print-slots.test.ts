import { expect, test } from 'bun:test'
import { Deck } from '@segnavia/format'
import { RequiredSlotsRefusedError, SlotFillRefusedError, SlotFillsConflictError, SlotFillsRefusedError } from '@segnavia/html'
import { MESSAGE } from './bridge.ts'
import { copiesPrint, printDeck, printPages } from './print.ts'
import { EMPTY_SLOTS } from './slot-render.ts'

test('browser print refuses a fill for a scripted deck before reporting', async () => {
  let reports = 0
  const deck = Deck.parse({
    title: 'Private fill',
    scripts: 'sandboxed',
    slots: [{ key: 'name', label: 'Name', type: 'text' }],
    slides: [{ id: 'one', content: { kind: 'html', html: '<p data-slot-value="name">Authored</p>' } }],
  })
  await expect(
    printDeck(deck, {
      slots: {
        fill: { id: 'private', values: { name: 'Filled' } },
        report: () => reports++,
      },
    }),
  ).rejects.toBeInstanceOf(SlotFillRefusedError)
  expect(reports).toBe(0)
})

test('browser deck and page printing refuse every required slot state before creating output', async () => {
  const declarations = [
    { key: 'name', label: 'Name', type: 'text' as const, required: true, placeholder: 'Preview' },
    { key: 'email', label: 'Email', type: 'email' as const, required: true },
    { key: 'site', label: 'Site', type: 'link' as const, required: true },
  ]
  const slots = { fill: { id: 'x', values: { email: 'invalid', site: 'javascript:bad()' } } }
  const deck = Deck.parse({ title: 'Required', slots: declarations, slides: [{ id: 'one', content: { kind: 'html', html: '<p>Design</p>' } }] })
  const printings = [
    () => printDeck(deck, { slots }),
    () =>
      printPages(
        [{ html: '<p>Design</p>', slots: declarations }],
        { paper: { unit: 'mm', width: 210, height: 297 }, columns: 1, rows: 1, cell: { width: 210, height: 297 } },
        { slots },
      ),
  ]
  for (const print of printings) {
    const printing = print()
    await expect(printing).rejects.toBeInstanceOf(RequiredSlotsRefusedError)
    await expect(printing).rejects.toThrow('"name" (placeholder), "email" (invalid), "site" (invalid)')
  }
})

const imposition = { paper: { unit: 'mm' as const, width: 210, height: 297 }, columns: 1, rows: 1, cell: { width: 210, height: 297 } }

test('browser print refuses fills together with fill', async () => {
  const deck = Deck.parse({ title: 'Fills', slides: [{ id: 'one', content: { kind: 'html', html: '<p>Design</p>' } }] })
  const slots = { fills: [{ fill: { id: 'ada', values: { name: 'Ada' } } }], fill: { id: 'ada', values: { name: 'Ada' } } }
  await expect(printDeck(deck, { slots })).rejects.toBeInstanceOf(SlotFillsConflictError)
  await expect(printPages([{ html: '<p>Design</p>' }], imposition, { slots })).rejects.toBeInstanceOf(SlotFillsConflictError)
})

test('browser print lists every refused fill before creating output', async () => {
  const declarations = [{ key: 'name', label: 'Name', type: 'text' as const, required: true, placeholder: 'Preview' }]
  const slots = {
    fills: [{ fill: { id: 'missing', values: {} } }, { source: { id: 'staff', values: {} } }],
  }
  const deck = Deck.parse({ title: 'Required', slots: declarations, slides: [{ id: 'one', content: { kind: 'html', html: '<p>Design</p>' } }] })
  const printings = [() => printDeck(deck, { slots }), () => printPages([{ html: '<p>Design</p>', slots: declarations }], imposition, { slots })]
  for (const print of printings) {
    const printing = print()
    await expect(printing).rejects.toBeInstanceOf(SlotFillsRefusedError)
    await expect(printing).rejects.toThrow('"missing" "name" (placeholder); 1 "name" (placeholder)')
  }
})

function dispatchFrom(target: EventTarget, source: EventTarget, data: unknown) {
  const event = new MessageEvent('message', { data })
  Object.defineProperty(event, 'source', { value: source })
  target.dispatchEvent(event)
}

async function until(predicate: () => boolean, what: string) {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > 1000) throw new Error(what)
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

test('printPages refuses an overflowed slot when its fit report arrives after the call', async () => {
  const inner = new EventTarget()
  const printWindow = new EventTarget() as EventTarget & {
    document: {
      open: () => void
      write: () => void
      close: () => void
      querySelectorAll: (selector: string) => unknown[]
      fonts: { ready: Promise<void> }
    }
    setTimeout: typeof setTimeout
  }
  let listening = false
  const add = printWindow.addEventListener.bind(printWindow)
  printWindow.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
    if (type === 'message') listening = true
    add(type, listener, options)
  }) as EventTarget['addEventListener']
  printWindow.document = {
    open() {},
    write() {},
    close() {},
    querySelectorAll(selector: string) {
      if (selector === 'iframe') return [{ contentWindow: inner }]
      return []
    },
    fonts: { ready: Promise.resolve() },
  }
  printWindow.setTimeout = setTimeout
  const host = { style: { cssText: '' }, contentWindow: printWindow, remove() {} }
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document')
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => host,
      body: { append() {} },
    },
  })
  try {
    const printing = printPages(
      [
        {
          size: { width: 336, height: 192 },
          slots: [{ key: 'name', label: 'Name', type: 'text', overflow: 'refuse' }],
          html: '<strong data-slot-value="name" style="display:block;inline-size:100px;white-space:nowrap">Design Name</strong>',
        },
      ],
      imposition,
      {
        slots: { fill: { id: 'long', values: { name: 'Alexandria Montgomery' } } },
        print: () => {
          throw new Error('overflowed refuse slot reached print')
        },
        deadlineMs: 2000,
      },
    )
    await until(() => listening, 'printPages did not listen for frame messages')
    dispatchFrom(printWindow, inner, { type: MESSAGE.ready })
    await Promise.resolve()
    let settled = false
    void printing.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      },
    )
    await Promise.resolve()
    expect(settled).toBeFalse()
    dispatchFrom(printWindow, inner, { type: MESSAGE.slotFit, slots: { name: 'overflowed' } })
    await expect(printing).rejects.toBeInstanceOf(RequiredSlotsRefusedError)
    await expect(printing).rejects.toThrow('"name" (overflowed)')
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous)
    else Reflect.deleteProperty(globalThis, 'document')
  }
})

test('copies print with their own prepared slots, never the caller options', () => {
  const prepared = {
    declarations: [],
    report: { fill: 'a', slots: {}, origins: {} },
    marked: new Map(),
    apply: (html: string) => html,
    mergeFit: () => prepared.report,
  }
  const one = { html: '<!doctype html><html><head></head><body><p>A</p></body></html>', slots: prepared, deadlineMs: 5 }
  const two = { ...one, html: '<!doctype html><html><head></head><body><p>B</p></body></html>' }
  expect(copiesPrint([one] as never)).toBe(one as never)
  const joined = copiesPrint([one, two] as never)
  expect(joined.html).toContain('<p>A</p><p>B</p>')
  expect(joined.slots).toBe(EMPTY_SLOTS)
  expect(joined.deadlineMs).toBe(5)
})
