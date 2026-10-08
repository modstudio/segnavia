// Printing a deck from the browser, through the same print document a server
// renders to PDF. The browser's print dialog opens once every slide has
// reported itself painted, or once the deadline passes so a slide that never
// reports cannot hold the dialog closed for ever.

import type { Deck } from '@segnavia/format'
import { type PrintOptions, printableDeck } from './print-document.ts'
import { printDocumentSettled } from './print-settlement.ts'

export const SLIDES_READY_DEADLINE_MS = 4000

export interface BrowserPrintOptions extends PrintOptions {
  deadlineMs?: number
  // Replaces the print dialog, for a host with its own print path; it is
  // handed the print document's window once every slide is ready.
  print?: (win: Window) => void | Promise<void>
}

export async function printDeck(deck: Deck, options: BrowserPrintOptions = {}): Promise<void> {
  const host = document.createElement('iframe')
  // Rendered at full size off screen: a hidden or empty frame may never be
  // laid out, and its slides would then never report themselves painted.
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${deck.size.width}px;height:${deck.size.height}px;border:0;opacity:0;pointer-events:none`
  document.body.append(host)
  try {
    const win = host.contentWindow as Window
    win.document.open()
    win.document.write(printableDeck(deck, options))
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
