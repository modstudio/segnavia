import type { Harness } from './harness.ts'
import { verifyLatePrintMoment } from './print-moments-browser.ts'

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
    const longToken = `https://example.invalid/${'unbroken'.repeat(30)}`
    const longNotes = `${longToken}\n${Array.from({ length: 60 }, (_, index) => `Line ${index + 1}: browser notes continue.`).join('\n')}`
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
      unclipped: false,
      horizontallyUnclipped: false,
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
            unclipped: noteSheets.every((sheet) => {
              const notes = sheet.querySelector<HTMLElement>('.notes')
              return notes ? notes.scrollHeight <= notes.clientHeight + 1 : false
            }),
            horizontallyUnclipped: noteSheets.every((sheet) => {
              const notes = sheet.querySelector<HTMLElement>('.notes')
              return notes ? notes.scrollWidth <= notes.clientWidth + 1 : false
            }),
          }
        },
      },
    )
    let rtlFacts = { continuations: 0, isolated: false }
    await lib.printDeck(
      { ...deck, dir: 'rtl', slides: [{ ...deck.slides[0], notes: Array.from({ length: 60 }, (_, index) => `שורה ${index + 1}`).join('\n') }] },
      {
        layout: 'notes',
        print: (win: Window) => {
          const continuations = [...win.document.querySelectorAll<HTMLElement>('[data-notes-continuation]')]
          rtlFacts = {
            continuations: continuations.length,
            isolated: continuations.every((sheet) => sheet.querySelector('.number > bdi[dir="ltr"]')?.textContent?.includes('(continued)')),
          }
        },
      },
    )
    const portraitNotes = 'Portrait notes stay entirely visible.'
    let portraitFacts = { exact: false, visible: false, inside: false }
    await lib.printDeck(
      { ...deck, size: { width: 720, height: 1280 }, slides: [{ ...deck.slides[0], notes: portraitNotes }] },
      {
        layout: 'notes',
        print: (win: Window) => {
          const sheets = [...win.document.querySelectorAll<HTMLElement>('.sheet')]
          const notes = sheets.map((sheet) => sheet.querySelector<HTMLElement>('.notes')).filter((item): item is HTMLElement => !!item)
          const firstSheet = sheets[0]
          const slide = firstSheet?.querySelector<HTMLElement>('.slide')
          portraitFacts = {
            exact: notes.map((item) => item.textContent).join('') === portraitNotes,
            visible: notes.every((item) => item.scrollHeight <= item.clientHeight + 1 && item.scrollWidth <= item.clientWidth + 1),
            inside: !!firstSheet && !!slide && slide.getBoundingClientRect().bottom < firstSheet.getBoundingClientRect().bottom,
          }
        },
      },
    )
    const emojiNotes = '👨‍👩‍👧‍👦'.repeat(1_000)
    let emojiFacts = { exact: false, intact: false, visible: false }
    await lib.printDeck(
      { ...deck, slides: [{ ...deck.slides[0], notes: emojiNotes }] },
      {
        layout: 'notes',
        print: (win: Window) => {
          const notes = [...win.document.querySelectorAll<HTMLElement>('.notes')]
          emojiFacts = {
            exact: notes.map((item) => item.textContent).join('') === emojiNotes,
            intact: notes.every((item) => {
              const text = item.textContent ?? ''
              const first = text.charCodeAt(0)
              const last = text.charCodeAt(text.length - 1)
              return !(first >= 0xdc00 && first <= 0xdfff) && !(last >= 0xd800 && last <= 0xdbff)
            }),
            visible: notes.every((item) => item.scrollHeight <= item.clientHeight + 1 && item.scrollWidth <= item.clientWidth + 1),
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
      rtlFacts,
      portraitFacts,
      emojiFacts,
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
      printed.notesFacts.unclipped &&
      printed.notesFacts.horizontallyUnclipped &&
      printed.notesFacts.owned &&
      printed.notesFacts.notesOnly &&
      printed.notesFacts.letter &&
      printed.notesFacts.scaled,
    JSON.stringify(printed),
  )
  check(
    'right-to-left notes isolate the slide number and continued marker',
    printed.rtlFacts.continuations > 0 && printed.rtlFacts.isolated,
    JSON.stringify(printed.rtlFacts),
  )
  check(
    'portrait deck notes remain complete and visible below the thumbnail',
    Object.values(printed.portraitFacts).every(Boolean),
    JSON.stringify(printed.portraitFacts),
  )
  check('emoji notes split without lone surrogate halves', Object.values(printed.emojiFacts).every(Boolean), JSON.stringify(printed.emojiFacts))
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

  const printingMoments = page.evaluate(async () => {
    const bundle = '/segnavia.js'
    const { printDeck } = (await import(bundle)) as { printDeck: (deck: unknown, options: unknown) => Promise<void> }
    const animated = (id: string, printAtMs?: number) => ({
      id,
      ...(printAtMs === undefined ? {} : { printAtMs }),
      content: {
        kind: 'html',
        html: '<style>@keyframes fade{from{opacity:0}to{opacity:1}}#target{animation:fade 1s linear both}</style><div id="target">Animated</div>',
      },
    })
    await printDeck(
      { title: 'Print moments', scripts: 'refuse', size: { width: 400, height: 200 }, slides: [animated('start'), animated('middle', 500)] },
      {
        print: async () => {
          await new Promise<void>((resolve) => {
            const state = window as Window & { releasePrintMoment?: () => void }
            state.releasePrintMoment = resolve
          })
        },
      },
    )
  })
  await page.waitForFunction(() => typeof (window as Window & { releasePrintMoment?: unknown }).releasePrintMoment === 'function')
  const printFrames = page.frameLocator('body > iframe[style*="-20000px"]').frameLocator('iframe')
  const animationFacts = await Promise.all(
    [0, 1].map((index) =>
      printFrames
        .nth(index)
        .locator('#target')
        .evaluate((target) => ({ opacity: getComputedStyle(target).opacity, time: Number(document.getAnimations()[0]?.currentTime) })),
    ),
  )
  await page.evaluate(() => (window as Window & { releasePrintMoment?: () => void }).releasePrintMoment?.())
  await printingMoments
  check(
    'browser deck printing freezes CSS animations at the default start and a chosen moment',
    Number(animationFacts[0]?.opacity) === 0 &&
      animationFacts[0]?.time === 0 &&
      Math.abs(Number(animationFacts[1]?.opacity) - 0.5) < 0.01 &&
      animationFacts[1]?.time === 500,
    JSON.stringify(animationFacts),
  )

  await verifyLatePrintMoment(h)

  const waitFacts = await page.evaluate(async () => {
    const bundle = '/segnavia.js'
    const { printDeck } = (await import(bundle)) as { printDeck: (deck: unknown, options: unknown) => Promise<void> }
    let drawn = 0
    const onMessage = (event: MessageEvent) => {
      if (event.data === 'test:print-drawn') drawn++
    }
    window.addEventListener('message', onMessage)
    const started = performance.now()
    await printDeck(
      {
        title: 'Scripted print',
        scripts: 'sandboxed',
        size: { width: 400, height: 200 },
        slides: [
          {
            id: 'scripted',
            content: {
              kind: 'html',
              html: `<p id="status">waiting</p><script>
window.addEventListener('segnavia:print',function(event){
  event.detail.waitUntil(new Promise(function(resolve){setTimeout(function(){top.postMessage('test:print-drawn','*');resolve();},120);}));
});
</script>`,
            },
          },
        ],
      },
      { print: () => {} },
    )
    window.removeEventListener('message', onMessage)
    return { drawn, elapsedMs: performance.now() - started }
  })
  check(
    'a scripted slide waitUntil holds print readiness until its frame is drawn',
    waitFacts.drawn === 1 && waitFacts.elapsedMs >= 100,
    JSON.stringify(waitFacts),
  )

  await page.route('**/deck-print-csp.html', async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      headers: { 'content-security-policy': "script-src 'self' 'nonce-probe'" },
      body: `<!doctype html><body><script type="module" nonce="probe">
import { printDeck } from '/segnavia.js';
const notes=Array.from({length:60},(_,index)=>'Line '+(index+1)+': CSP notes continue.').join('\\n');
const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="800"><rect width="400" height="800" fill="purple"/></svg>');
window.cspPrint=printDeck({title:'CSP print',size:{width:1280,height:720},slides:[{id:'notes',content:{kind:'html',html:'<p>Notes thumbnail</p>'},notes},{id:'image',content:{kind:'image',src:image,alt:'CSP image'}}]}, {layout:'notes',print(win){
  const sheets=[...win.document.querySelectorAll('.sheet')];
  const last=sheets.filter(sheet=>sheet.dataset.slideIndex==='0').at(-1);
  const lastNotes=last?.querySelector('.notes');
  const imageLayer=win.document.querySelector('[data-segnavia-image-layer]');
  window.cspFacts={continuations:sheets.filter(sheet=>sheet.hasAttribute('data-notes-continuation')).length,lastLine:lastNotes?.textContent?.includes('Line 60: CSP notes continue.')??false,unclipped:lastNotes?lastNotes.scrollHeight<=lastNotes.clientHeight+1:false,imagePlaced:imageLayer?.style.transform.includes('scale(')??false};
}});
</script>`,
    })
  })
  await page.goto(h.url('deck-print-csp.html'))
  const csp = await page.evaluate(async () => {
    await (window as Window & { cspPrint?: Promise<void> }).cspPrint
    return (window as Window & { cspFacts?: { continuations: number; lastLine: boolean; unclipped: boolean; imagePlaced: boolean } }).cspFacts
  })
  check(
    'browser deck printing paginates notes and places images under a nonce-only host CSP',
    !!csp && csp.continuations > 0 && csp.lastLine && csp.unclipped && csp.imagePlaced,
    JSON.stringify(csp),
  )

  await page.route('**/late-print-image.svg', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250))
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="800"><rect width="400" height="800" fill="teal"/></svg>',
    })
  })
  const lateImage = await page.evaluate(async () => {
    const bundle = '/segnavia.js'
    const { printDeck } = (await import(bundle)) as { printDeck: (deck: unknown, options: unknown) => Promise<void> }
    let facts = { placed: false, width: '', height: '', transform: '' }
    await printDeck(
      {
        title: 'Late image print',
        size: { width: 1280, height: 720 },
        slides: [{ id: 'late-image', content: { kind: 'image', src: '/late-print-image.svg', alt: 'Late image', fit: 'contain' } }],
      },
      {
        deadlineMs: 20,
        print: async (win: Window) => {
          const image = win.document.querySelector<HTMLImageElement>('[data-segnavia-image-layer] img')
          if (image && !image.complete) await new Promise((resolve) => image.addEventListener('load', resolve, { once: true }))
          const layer = win.document.querySelector<HTMLElement>('[data-segnavia-image-layer]')
          facts = {
            placed: layer?.style.transform === 'translate(460px, 0px) scale(0.9)',
            width: layer?.style.width ?? '',
            height: layer?.style.height ?? '',
            transform: layer?.style.transform ?? '',
          }
        },
      },
    )
    return facts
  })
  check(
    'an image that loads after the print deadline is fitted before the print hook observes it',
    lateImage.placed && lateImage.width === '400px' && lateImage.height === '800px',
    JSON.stringify(lateImage),
  )
}
