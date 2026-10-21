// Printing decks and imposed pages from the browser through frame-based print documents.
// The server instead composes top-level slide renders for its PDF path. The
// browser's print dialog opens once every slide
// has reported itself painted, or once the deadline passes so a slide that
// never reports cannot hold the dialog closed for ever.

import { type Deck, Imposition, type ImpositionInput, Page, type PageInput } from '@segnavia/format'
import { paperBoxSize } from './paper-geometry.ts'
import {
  type PrintablePagesOptions,
  type PrintOptions,
  paginateNotes,
  placePrintImages,
  printableDeck,
  printableDeckDocument,
  printablePagesDocument,
  SLIDES_READY_DEADLINE_MS,
} from './print-document.ts'
import { PAINT_FALLBACK_MS, waitForAfterPrint, waitForPaint, waitForReadiness } from './print-lifecycle.ts'
import { printDocumentSettled } from './print-settlement.ts'
import { EMPTY_SLOTS, hasSlotWork, prepareSlotCollection, prepareSlots, requiredSlotRefusal, slotFillRefusal } from './slot-render.ts'

export { SLIDES_READY_DEADLINE_MS } from './print-document.ts'

export interface PrintDialogOptions {
  deadlineMs?: number
  // Replaces the print dialog, for a host with its own print path; it is
  // handed the print document's window once every slide is ready.
  print?: (win: Window) => void | Promise<void>
}

export interface BrowserPrintOptions extends PrintOptions, PrintDialogOptions {}

interface PrintFrameOptions extends PrintDialogOptions {
  width: number
  height: number
  html: string
  slots: typeof EMPTY_SLOTS
}

async function printFrame(options: PrintFrameOptions): Promise<void> {
  const host = document.createElement('iframe')
  // Rendered at full size off screen: a hidden or empty frame may never be
  // laid out, and its slides would then never report themselves painted.
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${options.width}px;height:${options.height}px;border:0;opacity:0;pointer-events:none`
  document.body.append(host)
  let removeImageListeners = () => {}
  try {
    const win = host.contentWindow as Window
    win.document.open()
    win.document.write(options.html)
    win.document.close()
    const frames = [...win.document.querySelectorAll('iframe')]
    const images = [...win.document.querySelectorAll('img')]
    const pendingNaturalImages = [...win.document.querySelectorAll<HTMLImageElement>('[data-segnavia-image-layer] img')].filter((image) => !image.complete)
    const placeAfterLoad = () => placePrintImages(win.document)
    pendingNaturalImages.forEach((image) => {
      image.addEventListener('load', placeAfterLoad)
    })
    removeImageListeners = () => {
      pendingNaturalImages.forEach((image) => {
        image.removeEventListener('load', placeAfterLoad)
      })
    }
    const deadlineAt = Date.now() + (options.deadlineMs ?? SLIDES_READY_DEADLINE_MS)
    const deadline = new Promise<void>((resolve) => win.setTimeout(resolve, deadlineAt - Date.now()))
    const settled = printDocumentSettled(
      win,
      frames.map((frame) => frame.contentWindow as Window),
      images,
      deadline,
      (fit) => options.slots.mergeFit(fit),
    )
    await waitForReadiness([settled, win.document.fonts?.ready ?? Promise.resolve()], deadline)
    const overflowRefusal = requiredSlotRefusal(options.slots.declarations, options.slots.report)
    if (overflowRefusal) throw overflowRefusal
    placePrintImages(win.document)
    paginateNotes(win.document)
    await waitForPaint(win.requestAnimationFrame.bind(win), Math.max(PAINT_FALLBACK_MS, deadlineAt - Date.now()))
    if (options.print) await options.print(win)
    else {
      win.focus()
      const afterPrint = waitForAfterPrint(win)
      win.print()
      await afterPrint
    }
  } finally {
    removeImageListeners()
    host.remove()
  }
}

export async function printDeck(deck: Deck, options: BrowserPrintOptions = {}): Promise<void> {
  const refusal = slotFillRefusal(deck.scripts, deck.slots, options.slots)
  if (refusal) throw refusal
  const slotWork = hasSlotWork(deck.slots, options.slots)
  const resolvedSlots = slotWork ? await prepareSlots(deck.slots, options.slots) : EMPTY_SLOTS
  const requiredRefusal = requiredSlotRefusal(resolvedSlots.declarations, resolvedSlots.report)
  if (requiredRefusal) throw requiredRefusal
  const preparedDeck = {
    ...deck,
    slides: deck.slides.map((slide) =>
      slide.content.kind === 'html' ? { ...slide, content: { ...slide.content, html: resolvedSlots.apply(slide.content.html) } } : slide,
    ),
  }
  if (options.imposition) {
    const printable = printableDeckDocument(preparedDeck, { ...options, imposition: options.imposition })
    return printFrame({ ...paperBoxSize(printable.imposed.paper), html: printable.html, ...options, slots: resolvedSlots })
  }
  return printFrame({ ...deck.size, html: printableDeck(preparedDeck, options), ...options, slots: resolvedSlots })
}

export interface BrowserPagesPrintOptions extends PrintablePagesOptions, PrintDialogOptions {}

export async function printPages(pagesInput: PageInput[], impositionInput: ImpositionInput, options: BrowserPagesPrintOptions = {}): Promise<void> {
  const pages = pagesInput.map((page) => Page.parse(page))
  const imposition = Imposition.parse(impositionInput)
  for (const page of pages) {
    const refusal = slotFillRefusal(page.scripts, page.slots, options.slots)
    if (refusal) throw refusal
  }
  const work = pages.map((page) => hasSlotWork(page.slots, options.slots))
  const resolvedSlots = work.some(Boolean)
    ? await prepareSlotCollection(
        pages.map((page) => page.slots),
        options.slots,
      )
    : EMPTY_SLOTS
  const requiredRefusal = requiredSlotRefusal(resolvedSlots.declarations, resolvedSlots.report)
  if (requiredRefusal) throw requiredRefusal
  const filled = pages.map((page) => ({ ...page, html: resolvedSlots.apply(page.html) }))
  const printable = printablePagesDocument(filled, imposition, options)
  const paper = paperBoxSize(printable.imposed.paper)
  return printFrame({ ...paper, html: printable.html, ...options, slots: resolvedSlots })
}
