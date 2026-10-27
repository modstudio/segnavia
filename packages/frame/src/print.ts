// Printing decks and imposed pages from the browser through frame-based print documents.
// The server instead composes top-level slide renders for its PDF path. The
// browser's print dialog opens once every slide
// has reported itself painted, or once the deadline passes so a slide that
// never reports cannot hold the dialog closed for ever.

import { type Deck, Imposition, type ImpositionInput, Page, type PageInput } from '@segnavia/format'
import { expandFramePages, type MotifsOptions } from './motif-expansion.ts'
import { expandedPagesFontCss, type FontsOptions } from './page-fonts.ts'
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
import { joinPrintDocuments } from './print-join.ts'
import { PAINT_FALLBACK_MS, waitForAfterPrint, waitForPaint, waitForReadiness } from './print-lifecycle.ts'
import { printDocumentSettled, slotFitStillPending } from './print-settlement.ts'
import { printedPagesPrintDocument } from './printed-pages-print.ts'
import {
  collectSlotPrintCopies,
  EMPTY_SLOTS,
  hasSlotWork,
  prepareSlotCollection,
  prepareSlots,
  requiredSlotRefusal,
  type SlotPrintOptions,
  slotFillRefusal,
  unmeasuredSlotRefusal,
} from './slot-render.ts'

export { SLIDES_READY_DEADLINE_MS } from './print-document.ts'

export interface PrintDialogOptions {
  deadlineMs?: number
  // Replaces the print dialog, for a host with its own print path; it is
  // handed the print document's window once every slide is ready.
  print?: (win: Window) => void | Promise<void>
}

export interface BrowserPrintOptions extends Omit<PrintOptions, 'slots'>, PrintDialogOptions {
  slots?: SlotPrintOptions
}

interface PrintFrameOptions extends PrintDialogOptions {
  width: number
  height: number
  html: string
  slots: typeof EMPTY_SLOTS
  output?: 'print' | 'measure'
  strictFrameReadiness?: boolean
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
    const measured = new Map<string, number>()
    const refuseKeys = new Set(options.slots.declarations.filter((declaration) => declaration.overflow === 'refuse').map((declaration) => declaration.key))
    // Fit is a separate bridge message from ready. Print waits for every marked
    // refuse report, bounded by the same deadline, so a slow frame cannot print
    // an overflowed refuse slot before its measurement arrives.
    const settled = printDocumentSettled(
      win,
      frames.map((frame) => frame.contentWindow as Window),
      images,
      deadline,
      (fit) => {
        for (const key of Object.keys(fit)) measured.set(key, (measured.get(key) ?? 0) + 1)
        options.slots.mergeFit(fit)
      },
      () => slotFitStillPending(options.slots.marked, measured, refuseKeys),
    )
    await waitForReadiness([settled, win.document.fonts?.ready ?? Promise.resolve()], deadline)
    if (options.strictFrameReadiness && !(await settled)) {
      throw new Error(
        'The printed pages could not establish that every composed page was ready; wait for their resources or shorten the content to clear this refusal.',
      )
    }
    const overflowRefusal = requiredSlotRefusal(options.slots.declarations, options.slots.report)
    if (overflowRefusal) throw overflowRefusal
    const measurementRefusal = unmeasuredSlotRefusal(options.slots.declarations, options.slots.report, options.slots.marked, measured)
    if (measurementRefusal) throw measurementRefusal
    if (options.output === 'measure') return
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

async function preparedDeckPrint(deck: Deck, options: BrowserPrintOptions): Promise<PrintFrameOptions> {
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
    return { ...paperBoxSize(printable.imposed.paper), html: printable.html, ...options, slots: resolvedSlots }
  }
  return { ...deck.size, html: printableDeck(preparedDeck, options), ...options, slots: resolvedSlots }
}

async function preparedPagesPrint(pagesInput: PageInput[], impositionInput: ImpositionInput, options: BrowserPagesPrintOptions): Promise<PrintFrameOptions> {
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
  if (filled.some((page) => page.printedPages)) {
    const printable = await printedPagesPrintDocument(filled, imposition, {
      ...options,
      deadlineMs: options.deadlineMs ?? SLIDES_READY_DEADLINE_MS,
    })
    return { ...paperBoxSize(printable.paper), html: printable.html, ...options, slots: resolvedSlots, strictFrameReadiness: true }
  }
  const printable = printablePagesDocument(filled, imposition, options)
  return { ...paperBoxSize(printable.imposed.paper), html: printable.html, ...options, slots: resolvedSlots }
}

/**
 * The one print the copies become. Each copy was prepared from the caller's options with its own slots and was
 * measured and checked on its own, so the caller's options are not applied again: their raw `fills` would replace
 * the copy's prepared slots. Several copies print as one joined document whose slots were already settled per copy.
 */
export function copiesPrint(copies: readonly PrintFrameOptions[]): PrintFrameOptions {
  const first = copies[0]
  if (!first) throw new RangeError('There is nothing to print. Pass at least one fill, or omit fills, to clear this refusal.')
  if (copies.length === 1) return first
  return { ...first, html: joinPrintDocuments(copies.map((copy) => copy.html)), slots: EMPTY_SLOTS }
}

export async function printDeck(deck: Deck, options: BrowserPrintOptions = {}): Promise<void> {
  if (!options.slots?.fills) return printFrame(await preparedDeckPrint(deck, options))
  const copies = await collectSlotPrintCopies(options.slots, async (copySlots) => {
    const prepared = await preparedDeckPrint(deck, { ...options, slots: copySlots })
    await printFrame({ ...prepared, output: 'measure' })
    return prepared
  })
  return printFrame(copiesPrint(copies))
}

export interface BrowserPagesPrintOptions extends Omit<PrintablePagesOptions, 'slots'>, PrintDialogOptions {
  slots?: SlotPrintOptions
  motifs?: MotifsOptions
  fonts?: FontsOptions
}

export async function printPages(pagesInput: PageInput[], impositionInput: ImpositionInput, options: BrowserPagesPrintOptions = {}): Promise<void> {
  const signal = new AbortController().signal
  const expanded = await expandFramePages(
    pagesInput.map((page) => Page.parse(page)),
    options.motifs,
    signal,
  )
  const fontCss = await expandedPagesFontCss(expanded, options.fonts, signal)
  const pages = expanded.map((item) => item.page)
  const preparedOptions = { ...options, motifs: undefined, fonts: undefined, css: `${fontCss}${options.css ?? ''}` }
  if (!options.slots?.fills) return printFrame(await preparedPagesPrint(pages, impositionInput, preparedOptions))
  const copies = await collectSlotPrintCopies(options.slots, async (copySlots) => {
    const prepared = await preparedPagesPrint(pages, impositionInput, { ...preparedOptions, slots: copySlots })
    await printFrame({ ...prepared, output: 'measure' })
    return prepared
  })
  return printFrame(copiesPrint(copies))
}
