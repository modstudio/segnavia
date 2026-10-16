import type { Harness } from './harness.ts'

const PLAYER = 'segnavia-player'

export async function verifyDeckPrintBrowser(h: Harness) {
  const { page, check } = h
  await page.goto(h.url(''))
  await h.waitFor(PLAYER, (d) => d.slide === '1')
  const printed = await page.evaluate(async () => {
    const bundle = '/segnavia.js'
    const lib = (await import(bundle)) as { printDeck: (deck: unknown, options: unknown) => Promise<void> }
    const deck = await (await fetch('/deck-print.json')).json()
    const started = performance.now()
    let sheets = 0
    let frames = 0
    let slidePages = false
    await lib.printDeck(deck, {
      print: (win: Window) => {
        sheets = win.document.querySelectorAll('.sheet').length
        frames = win.document.querySelectorAll('iframe').length
        const sheet = win.document.querySelector<HTMLElement>('.sheet')
        const frame = win.document.querySelector<HTMLElement>('.sheet iframe')
        const printHtml = win.document.documentElement.innerHTML
        slidePages =
          printHtml.includes('@page{size:1280px 720px') &&
          sheet?.getBoundingClientRect().width === 1280 &&
          sheet.getBoundingClientRect().height === 720 &&
          frame?.getBoundingClientRect().width === 1280 &&
          frame.getBoundingClientRect().height === 720
      },
    })
    const ms = Math.round(performance.now() - started)
    const slides = Array.from({ length: 7 }, (_, index) => ({ ...deck.slides[index % deck.slides.length], id: `handout-${index}` }))
    let papers = 0
    let placements = 0
    const handoutStarted = performance.now()
    await lib.printDeck(
      { ...deck, slides },
      {
        imposition: {
          paper: 'letter',
          orientation: 'portrait',
          unit: 'mm',
          columns: 2,
          rows: 3,
          cell: { width: 90, height: 70 },
          margin: { top: 12, right: 12, bottom: 12, left: 12 },
          gap: { column: 8, row: 8 },
          bleed: 0,
          fit: 'contain',
        },
        print: (win: Window) => {
          papers = win.document.querySelectorAll('.paper').length
          placements = win.document.querySelectorAll('.placement').length
        },
      },
    )
    const longNotes = Array.from({ length: 60 }, (_, index) => `Line ${index + 1}: browser notes continue.`).join('\n')
    let notesFacts = {
      sheets: 0,
      continuations: 0,
      lastLine: false,
      owned: false,
      notesOnly: false,
      letter: false,
      scaled: false,
      sandboxed: false,
      exact: false,
    }
    await lib.printDeck(
      { ...deck, slides: [{ ...deck.slides[0], id: 'long-notes', notes: longNotes }] },
      {
        layout: 'notes',
        print: (win: Window) => {
          const noteSheets = [...win.document.querySelectorAll<HTMLElement>('.sheet')]
          const continuation = noteSheets.filter((sheet) => sheet.hasAttribute('data-notes-continuation'))
          const slide = win.document.querySelector<HTMLElement>('.slide')
          const frame = win.document.querySelector<HTMLIFrameElement>('.slide iframe')
          const printHtml = win.document.documentElement.innerHTML
          notesFacts = {
            sheets: noteSheets.length,
            continuations: continuation.length,
            lastLine: noteSheets.at(-1)?.textContent?.includes('Line 60: browser notes continue.') ?? false,
            owned: noteSheets.every((sheet) => sheet.dataset.slideIndex === '0'),
            notesOnly: continuation.every((sheet) => !sheet.querySelector('iframe')),
            letter: printHtml.includes('@page{size:215.9mm 279.4mm'),
            scaled: Math.abs((slide?.getBoundingClientRect().width ?? 0) - 722) < 1 && Math.abs((slide?.getBoundingClientRect().height ?? 0) - 407) < 1,
            sandboxed: frame?.sandbox.value === 'allow-scripts',
            exact: frame?.srcdoc.includes('print-color-adjust:exact') ?? false,
          }
        },
      },
    )
    const removed = ![...document.querySelectorAll<HTMLIFrameElement>('body > iframe')].some((frame) => frame.style.left === '-20000px')
    const stalledStarted = performance.now()
    let stalledPrinted = false
    await lib.printDeck(
      {
        ...deck,
        scripts: 'sandboxed',
        slides: [
          {
            id: 'stalled',
            content: {
              kind: 'html',
              html: '<script>Object.defineProperty(document,"fonts",{value:{ready:new Promise(function(){})}})</script><p>Stalled font readiness</p>',
            },
          },
        ],
      },
      { deadlineMs: 20, print: () => (stalledPrinted = true) },
    )
    const stalledMs = performance.now() - stalledStarted
    const stalledRemoved = ![...document.querySelectorAll<HTMLIFrameElement>('body > iframe')].some((frame) => frame.style.left === '-20000px')
    return {
      sheets,
      frames,
      slidePages,
      ms,
      papers,
      placements,
      handoutMs: Math.round(performance.now() - handoutStarted),
      notesFacts,
      removed,
      stalledPrinted,
      stalledRemoved,
      stalledMs,
    }
  })
  check(
    'printing from the browser waits for every slide to report ready, not for the deadline',
    printed.sheets === 4 && printed.frames === 2 && printed.slidePages && printed.ms < 3500,
    JSON.stringify(printed),
  )
  check(
    'browser handout printing exposes two papers and seven placement boxes before the deadline',
    printed.papers === 2 && printed.placements === 7 && printed.handoutMs < 3500,
    JSON.stringify(printed),
  )
  check(
    'letter notes preserve the last of 60 lines on owned notes-only continuation sheets',
    printed.notesFacts.sheets > 1 &&
      printed.notesFacts.continuations === printed.notesFacts.sheets - 1 &&
      printed.notesFacts.lastLine &&
      printed.notesFacts.owned &&
      printed.notesFacts.notesOnly &&
      printed.notesFacts.letter &&
      printed.notesFacts.scaled,
    JSON.stringify(printed),
  )
  check(
    'browser deck printing keeps the slide sandbox, injects exact color, and removes the hook host synchronously',
    printed.notesFacts.sandboxed && printed.notesFacts.exact && printed.removed,
    JSON.stringify(printed),
  )
  check(
    'a stalled slide still reaches the browser print hook by its deadline and removes its host',
    printed.stalledPrinted && printed.stalledRemoved && printed.stalledMs < 500,
    JSON.stringify(printed),
  )
}
