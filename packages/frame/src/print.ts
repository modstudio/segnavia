// Printing decks and imposed pages from the browser through frame-based print documents.
// The server instead composes top-level slide renders for its PDF path. The
// browser's print dialog opens once every slide
// has reported itself painted, or once the deadline passes so a slide that
// never reports cannot hold the dialog closed for ever.

import {
  type Deck,
  type DocumentInput,
  deckFromDocument,
  exceedsLimits,
  Imposition,
  type ImpositionInput,
  type Limits,
  limitRefusal,
  parseLimits,
} from '@segnavia/format'
import { type HtmlPage, pageOrPrintedFromInput, parseDocument, resolvePageHtml } from '@segnavia/html'
import type { AssetPlacementsOptions as PlacementsOptions } from './board-policy.ts'
import { loadDiagramScript } from './diagram-document.ts'
import { expandFramePages, type MotifsOptions } from './motif-expansion.ts'
import { expandedPagesFontCss, type FontsOptions, resolveNotesFontCss } from './page-fonts.ts'
import { parsePageWidths } from './page-widths.ts'
import { paperBoxSize } from './paper-geometry.ts'
import {
  type PrintablePagesOptions,
  type PrintOptions,
  paginateNotes,
  placePrintImages,
  printableDeckValue,
  printableDeckValueDocument,
  printableHtmlPagesDocument,
  resolveDeckMedia,
  SLIDES_READY_DEADLINE_MS,
} from './print-document.ts'
import { joinPrintDocuments } from './print-join.ts'
import { PAINT_FALLBACK_MS, waitForAfterPrint, waitForPaint, waitForReadiness } from './print-lifecycle.ts'
import { pagesSheetsRefusal } from './print-limits.ts'
import { printDocumentSettled, slotFitStillPending } from './print-settlement.ts'
import type { PageOrPrintedInput } from './printed-page-document.ts'
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
  fonts?: FontsOptions
  placements?: PlacementsOptions
}

interface PrintFrameOptions extends PrintDialogOptions {
  width: number
  height: number
  html: string
  slots: typeof EMPTY_SLOTS
  output?: 'print' | 'measure'
  strictFrameReadiness?: boolean
  deadlineAt?: number
  limits?: Limits
  sheets?: number
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
    const deadlineAt = options.deadlineAt ?? Date.now() + (options.deadlineMs ?? SLIDES_READY_DEADLINE_MS)
    const deadline = new Promise<void>((resolve) => win.setTimeout(resolve, Math.max(0, deadlineAt - Date.now())))
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
        'The printed pages could not establish that every composed page was ready because parent-page geometry or content composition failed, or page resources did not settle; correct the parent-page geometry or content failure, or wait for its resources, to clear this refusal.',
      )
    }
    const overflowRefusal = requiredSlotRefusal(options.slots.declarations, options.slots.report)
    if (overflowRefusal) throw overflowRefusal
    const measurementRefusal = unmeasuredSlotRefusal(options.slots.declarations, options.slots.report, options.slots.marked, measured)
    if (measurementRefusal) throw measurementRefusal
    if (options.output === 'measure') return
    placePrintImages(win.document)
    const sheetsLimit = options.limits?.sheets
    const pagination = paginateNotes(win.document, sheetsLimit)
    if (sheetsLimit !== undefined && pagination.exceeded) throw new RangeError(limitRefusal('sheets', pagination.sheets, sheetsLimit, { atLeast: true }))
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

export async function preparedDeckPrint(
  input: DocumentInput,
  options: BrowserPrintOptions & { notesSheetFont?: { family: string; css: string } },
  signal: AbortSignal = AbortSignal.any([]),
): Promise<PrintFrameOptions> {
  return preparedDeckValuePrint(deckFromDocument(parseDocument(input, { newId: options.newId })), options, signal)
}

export async function preparedDeckValuePrint(
  deck: Deck,
  options: BrowserPrintOptions & { notesSheetFont?: { family: string; css: string } },
  signal: AbortSignal = AbortSignal.any([]),
): Promise<PrintFrameOptions> {
  const resolvedDeck = await resolveDeckMedia(deck, options.placements, 'print', signal)
  const refusal = slotFillRefusal(resolvedDeck.scripts, resolvedDeck.slots, options.slots)
  if (refusal) throw refusal
  const slotWork = hasSlotWork(resolvedDeck.slots, options.slots)
  const resolvedSlots = slotWork ? await prepareSlots(resolvedDeck.slots, options.slots, signal) : EMPTY_SLOTS
  const requiredRefusal = requiredSlotRefusal(resolvedSlots.declarations, resolvedSlots.report)
  if (requiredRefusal) throw requiredRefusal
  const notesSheetFont =
    options.notesSheetFont ?? (options.layout === 'notes' ? await resolveNotesFontCss(options.notesFont, options.fonts, signal) : undefined)
  const printOptions = { ...options, notesSheetFont }
  const preparedDeck = {
    ...resolvedDeck,
    slides: resolvedDeck.slides.map((slide) =>
      'kind' in slide.content && slide.content.kind === 'html'
        ? { ...slide, content: { ...slide.content, html: resolvedSlots.apply(slide.content.html) } }
        : slide,
    ),
  }
  if (options.imposition) {
    const printable = printableDeckValueDocument(preparedDeck, { ...printOptions, imposition: options.imposition })
    return { ...paperBoxSize(printable.imposed.paper), html: printable.html, ...options, slots: resolvedSlots }
  }
  return { ...resolvedDeck.size, html: printableDeckValue(preparedDeck, printOptions), ...options, slots: resolvedSlots }
}

async function preparedPagesPrint(
  pages: HtmlPage[],
  impositionInput: ImpositionInput,
  options: BrowserPagesPrintOptions & { deadlineAt?: number },
): Promise<PrintFrameOptions> {
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
  const diagramScript = await loadDiagramScript(filled.map((page) => page.html).join(''))
  options = { ...options, diagramScript }
  if (filled.some((page) => page.printedPages)) {
    const printable = await printedPagesPrintDocument(filled, imposition, {
      ...options,
      deadlineAt: options.deadlineAt ?? Date.now() + (options.deadlineMs ?? SLIDES_READY_DEADLINE_MS),
    })
    return { ...paperBoxSize(printable.paper), html: printable.html, ...options, slots: resolvedSlots, sheets: printable.sheets, strictFrameReadiness: true }
  }
  const printable = printableHtmlPagesDocument(filled, imposition, options)
  return {
    ...paperBoxSize(printable.imposed.paper),
    html: printable.html,
    ...options,
    slots: resolvedSlots,
    sheets: printable.imposed.papers * printable.imposed.sides,
  }
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
  return {
    ...first,
    html: joinPrintDocuments(copies.map((copy) => copy.html)),
    slots: EMPTY_SLOTS,
    sheets: copies.reduce((total, copy) => total + (copy.sheets ?? 0), 0),
  }
}

function refusePagesSheets(options: PrintFrameOptions): void {
  if (options.sheets === undefined) return
  const refusal = pagesSheetsRefusal(options.sheets, options.limits)
  if (refusal) throw new RangeError(refusal)
}

export async function printDeck(input: DocumentInput, options: BrowserPrintOptions = {}): Promise<void> {
  const deck = deckFromDocument(parseDocument(input, { newId: options.newId }))
  options = { ...options, limits: parseLimits(options.limits, 'host') }
  const reasons = exceedsLimits(deck, options.limits ?? {})
  if (reasons.length > 0) throw new RangeError(reasons.join('; '))
  const signal = new AbortController().signal
  const notesSheetFont = options.layout === 'notes' ? await resolveNotesFontCss(options.notesFont, options.fonts, signal) : undefined
  const preparedOptions = { ...options, notesSheetFont }
  if (!options.slots?.fills) return printFrame(await preparedDeckValuePrint(deck, preparedOptions, signal))
  const copies = await collectSlotPrintCopies(options.slots, async (copySlots) => {
    const prepared = await preparedDeckValuePrint(deck, { ...preparedOptions, slots: copySlots }, signal)
    await printFrame({ ...prepared, output: 'measure' })
    return prepared
  })
  return printFrame(copiesPrint(copies))
}

export interface BrowserPagesPrintOptions extends Omit<PrintablePagesOptions, 'slots'>, PrintDialogOptions {
  slots?: SlotPrintOptions
  motifs?: MotifsOptions
  fonts?: FontsOptions
  placements?: PlacementsOptions
}

export async function printPages(pagesInput: PageOrPrintedInput[], impositionInput: ImpositionInput, options: BrowserPagesPrintOptions = {}): Promise<void> {
  options = { ...options, limits: parseLimits(options.limits, 'host'), pageWidths: parsePageWidths(options.pageWidths) }
  const deadlineAt = Date.now() + (options.deadlineMs ?? SLIDES_READY_DEADLINE_MS)
  const signal = new AbortController().signal
  const expanded = await expandFramePages(
    pagesInput.map((page) => resolvePageHtml(pageOrPrintedFromInput(page))),
    options.motifs,
    signal,
    options.placements,
    'print',
    options.pageWidths,
  )
  const { css: fontCss } = await expandedPagesFontCss(expanded, options.fonts, signal)
  const pages = expanded.map((item) => item.page)
  const preparedOptions = { ...options, motifs: undefined, fonts: undefined, css: `${fontCss}${options.css ?? ''}`, deadlineAt }
  if (!options.slots?.fills) {
    const prepared = await preparedPagesPrint(pages, impositionInput, preparedOptions)
    refusePagesSheets(prepared)
    return printFrame(prepared)
  }
  const copies = await collectSlotPrintCopies(options.slots, async (copySlots) => {
    const prepared = await preparedPagesPrint(pages, impositionInput, { ...preparedOptions, slots: copySlots })
    await printFrame({ ...prepared, output: 'measure' })
    return prepared
  })
  const prepared = copiesPrint(copies)
  refusePagesSheets(prepared)
  return printFrame(prepared)
}
