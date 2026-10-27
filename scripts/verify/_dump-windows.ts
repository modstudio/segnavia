import { openHarness } from './harness.ts'

const h = await openHarness()
await h.page.goto(h.url('book-paginated.html'))
const element = await h.page.$('#book-paginated-he')
const frame = await element?.contentFrame()
if (!frame) throw new Error('no frame')
await frame.waitForFunction(() => document.documentElement.hasAttribute('data-segnavia-composed'), undefined, { timeout: 20000 })
const info = await frame.evaluate(() => {
  return Array.from(document.querySelectorAll('[data-segnavia-window]')).map((view, index) => {
    const page = view.closest('[data-segnavia-book-page]')
    const text = view.closest('[data-segnavia-text]')
    const box = view.getBoundingClientRect()
    const textBox = text?.getBoundingClientRect()
    const clone = view.firstElementChild
    const spacer = view.querySelector('[data-segnavia-window-spacer]')
    return {
      index,
      flow: view.getAttribute('data-flow'),
      page: page?.getAttribute('data-segnavia-book-page'),
      role: page?.getAttribute('data-segnavia-role'),
      start: view.getAttribute('data-start'),
      end: view.getAttribute('data-end'),
      top: view.getAttribute('data-top'),
      column: view.getAttribute('data-column'),
      height: box.height,
      aboveText: textBox ? box.top - textBox.top : null,
      spacer: spacer ? (spacer as HTMLElement).style.paddingBlockStart : null,
      cloneTop: clone ? (clone as HTMLElement).style.insetBlockStart : null,
    }
  })
})
console.log(JSON.stringify(info, null, 2))
await h.close()
