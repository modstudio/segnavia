// Printing decks and imposed pages from the browser through frame-based print documents.
// The server instead composes top-level slide renders because Chromium loses
// frame backgrounds in PDFs. The browser's print dialog opens once every slide
// has reported itself painted, or once the deadline passes so a slide that
// never reports cannot hold the dialog closed for ever.

import { type Deck, Imposition, type ImpositionInput, Page, type PageInput } from '@segnavia/format'
import { paperBoxSize } from './paper-geometry.ts'
import { type PrintablePagesOptions, type PrintOptions, printableDeck, printablePagesDocument } from './print-document.ts'
import { printDocumentSettled } from './print-settlement.ts'

export const SLIDES_READY_DEADLINE_MS = 4000

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
}

async function printFrame(options: PrintFrameOptions): Promise<void> {
  const host = document.createElement('iframe')
  // Rendered at full size off screen: a hidden or empty frame may never be
  // laid out, and its slides would then never report themselves painted.
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${options.width}px;height:${options.height}px;border:0;opacity:0;pointer-events:none`
  document.body.append(host)
  try {
    const win = host.contentWindow as Window
    win.document.open()
    win.document.write(options.html)
    win.document.close()
    const frames = [...win.document.querySelectorAll('iframe')]
    const images = [...win.document.querySelectorAll('img')]
    const deadline = new Promise<void>((resolve) => win.setTimeout(resolve, options.deadlineMs ?? SLIDES_READY_DEADLINE_MS))
    await printDocumentSettled(
      win,
      frames.map((frame) => frame.contentWindow as Window),
      images,
      deadline,
    )
    await win.document.fonts?.ready
    if (options.print) await options.print(win)
    else {
      win.focus()
      win.print()
    }
  } finally {
    // The dialog is modal in every engine, so by the time print returns the
    // document has been handed to the printer.
    host.remove()
  }
}

export async function printDeck(deck: Deck, options: BrowserPrintOptions = {}): Promise<void> {
  return printFrame({ width: deck.size.width, height: deck.size.height, html: printableDeck(deck, options), ...options })
}

export interface BrowserPagesPrintOptions extends PrintablePagesOptions, PrintDialogOptions {}

// A browser print dialog loses backgrounds inside frames. A host that needs
// those backgrounds uses the renderer's pagesPdf instead.
export async function printPages(pagesInput: PageInput[], impositionInput: ImpositionInput, options: BrowserPagesPrintOptions = {}): Promise<void> {
  const pages = pagesInput.map((page) => Page.parse(page))
  const imposition = Imposition.parse(impositionInput)
  const printable = printablePagesDocument(pages, imposition, options)
  const paper = paperBoxSize(printable.imposed.paper)
  return printFrame({ ...paper, html: printable.html, ...options })
}
