// The whole loop on the demo app: capture shots, narrate, assemble a deck that
// mixes static and playing slides, render it every way a host needs, and
// publish a player for it.

import './source-guard.ts'
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { capture } from '@segnavia/capture'
import { Deck, jsonSchemas, type Narration, type PublishedShot, type Shot } from '@segnavia/format'
import { bridgeForHost } from '@segnavia/frame/bridge'
import { wordIndex } from '@segnavia/frame/timeline'
import { fill } from '@segnavia/html'
import { openRenderer, RenderRefusedError } from '@segnavia/render'
import { narrate, pacedProvider } from '@segnavia/voice'
import { demoFlows, demoHost, observed } from '../fixtures/demo-app/host.ts'
import { buildCaptureOutputFacts } from './build-capture-output.ts'
import { fixedPage, fluidPage, hebrewPage, marginPage, rightToLeftDivPage } from './demo-page-fixtures.ts'

const ROOT = path.resolve(import.meta.dir, '..')
const OUT = path.join(ROOT, 'out')
const SITE = path.join(OUT, 'site')
const CHROMIUM = process.env.SEGNAVIA_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

const build = Bun.spawn(['bun', 'run', 'build'], { cwd: ROOT, stdout: 'inherit', stderr: 'inherit' })
if ((await build.exited) !== 0) throw new Error('bun run build failed.')

rmSync(SITE, { recursive: true, force: true })
mkdirSync(path.join(SITE, 'shots'), { recursive: true })

// The demo app: English or Hebrew, signed in by cookie or a guest, with an
// API that answers or refuses under load.
const app = Bun.serve({
  port: 0,
  fetch: async (request) => {
    const url = new URL(request.url)
    if (url.pathname === '/api/ping') return new Response('ok')
    if (url.pathname === '/api/busy') return new Response('slow down', { status: 429 })
    const file = path.join(ROOT, 'fixtures/demo-app', url.pathname.startsWith('/he') ? 'index-he.html' : 'index.html')
    const signedIn = (request.headers.get('cookie') ?? '').includes('session=teacher')
    const html = (await Bun.file(file).text())
      .replace(/<span class="profile">[^<]*<\/span>/, (profile) => (signedIn ? profile : '<a class="signin" href="#">Sign in</a>'))
      .replace(/<span class="session-only">[^<]*<\/span>/, (content) => (signedIn ? content : ''))
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
  },
})
const shotsDirectory = path.join(OUT, 'shots')
const baseUrl = `http://localhost:${app.port}`
const run = await capture(demoHost(baseUrl), demoFlows, {
  baseUrl,
  outputDirectory: shotsDirectory,
  executablePath: CHROMIUM,
  output: { format: 'webp', quality: [90, 80, 70], maxBytes: 5 * 1024 * 1024, annotated: true },
  meta: { appVersion: 'demo-1' },
  log: console.log,
})
const outputFacts = await buildCaptureOutputFacts(baseUrl, OUT, CHROMIUM)
app.stop()
// These flows are meant to fail and prove each refusal leaves the capture run usable.
const EXPECTED_FAILURES = new Set(['refused', 'broken', 'ambiguous', 'outside', 'transaction'])
for (const result of run.results) console.log(result.ok ? `captured ${result.name}: ${result.shots.length} shots` : `failed ${result.name}: ${result.error}`)
if (run.results.some((result) => result.ok === EXPECTED_FAILURES.has(result.name))) process.exit(1)
writeFileSync(
  path.join(OUT, 'capture-facts.json'),
  JSON.stringify(
    { observed, outputFacts, results: run.results.map(({ name, ok, error, failureScreenshot }) => ({ name, ok, error, failureScreenshot })) },
    null,
    2,
  ),
)

const voice = pacedProvider({ wordsPerMinute: 170 })
const cache = path.join(OUT, 'voice')

async function narration(text: string, cues: (n: Pick<Narration, 'words'>) => Narration['cues'], lang?: string): Promise<Narration> {
  const spoken = await narrate(voice, text, { cacheDirectory: cache })
  return { text, lang, ...spoken, live: false, cues: cues(spoken) }
}

function publish(key: string): Shot {
  const shot = run.manifest.shots[key] as Shot
  for (const file of [shot.file, shot.annotatedFile]) if (file) copyFileSync(path.join(shotsDirectory, file), path.join(SITE, 'shots', file))
  return shot
}

// The list shot is embedded; the form shot is named by its permanent address,
// as a host serving a shot library would.
const listShot = publish('classes.list')
const formShot = publish('classes.create.form')
const published: PublishedShot = { src: formShot.file, shot: formShot }
writeFileSync(path.join(SITE, 'shots', 'classes.create.form.json'), JSON.stringify(published))

const card = (title: string, body: string) =>
  `<!doctype html><html><body style="margin:0;height:100vh;display:grid;place-content:center;font-family:system-ui,sans-serif;background:#1f3a8a;color:#fff;text-align:center"><h1 style="font-size:64px;margin:0 0 16px">${title}</h1><p style="font-size:28px;margin:0;opacity:.85">${body}</p><script>document.body.style.background = 'red'</script></body></html>`

const summary = fill(
  `<!doctype html><html><body style="margin:0;height:100vh;display:grid;place-content:center;font-family:system-ui,sans-serif;background:#0f766e;color:#fff"><h1 style="font-size:56px;margin:0 0 24px">Your classes: <span data-demo-value="count"></span></h1><ul style="font-size:28px"><li data-demo-each="classes"><span data-demo-value="name"></span>, grade <span data-demo-value="grade"></span></li></ul></body></html>`,
  {
    prefix: 'demo',
    data: {
      count: 3,
      classes: [
        { name: 'Morning reading', grade: 2 },
        { name: 'Number sense', grade: 3 },
        { name: 'Afternoon art', grade: 2 },
      ],
    },
  },
)
if (summary.unavailable.length > 0) throw new Error(`The summary slide is missing ${summary.unavailable.join(', ')}.`)

const deck = Deck.parse({
  title: 'Creating a class',
  slides: [
    { id: 'intro', content: { kind: 'html', html: card('Creating a class', 'A two-minute walkthrough') }, notes: 'Static title slide.' },
    {
      id: 'list',
      content: { kind: 'shot', src: `shots/${listShot.file}`, shot: listShot },
      notes: 'The class list is where every class starts.',
      narration: await narration('Everything starts on your class list. To add a class, choose New class.', (n) => [
        { word: wordIndex(n, 'New'), annotation: 0 },
      ]),
    },
    {
      id: 'form',
      content: { kind: 'shot-ref', href: 'shots/classes.create.form.json' },
      notes: 'Complete the class form.',
      narration: await narration('Give the class a name, then pick its grade. When it looks right, press Create to save it.', (n) => [
        { word: wordIndex(n, 'name'), annotation: 0, untilWord: wordIndex(n, 'pick') },
        { word: wordIndex(n, 'grade'), annotation: 1, untilWord: wordIndex(n, 'press') },
        { word: wordIndex(n, 'Create'), annotation: 2 },
      ]),
    },
    { id: 'done', content: { kind: 'html', html: summary.html }, notes: 'Review the finished class list.' },
  ],
})

// The same walkthrough in Hebrew, right to left, captured from the Hebrew app.
const heList = publish('he.classes.list')
const heForm = publish('he.classes.create.form')
const heSummary = fill(
  `<!doctype html><html><body style="margin:0;height:100vh;display:grid;place-content:center;font-family:system-ui,sans-serif;background:#0f766e;color:#fff"><h1 style="font-size:56px;margin:0 0 24px">נוצרה הכיתה <span data-demo-value="name"></span>.</h1><p style="font-size:28px;margin:0">היא מופיעה בראש הרשימה.</p></body></html>`,
  { prefix: 'demo', data: { name: 'Afternoon art' } },
)
const hebrew = Deck.parse({
  title: 'יצירת כיתה',
  lang: 'he',
  slides: [
    { id: 'intro', content: { kind: 'html', html: card('יצירת כיתה', 'הדרכה של שתי דקות') }, notes: 'שקופית פתיחה, בלי קריינות.' },
    {
      id: 'list',
      content: { kind: 'shot', src: `shots/${heList.file}`, shot: heList },
      notes: 'כל כיתה מתחילה ברשימת הכיתות.',
      narration: await narration('הכול מתחיל ברשימת הכיתות. כדי להוסיף כיתה, בחרו כיתה חדשה.', (n) => [{ word: wordIndex(n, 'חדשה'), annotation: 0 }], 'he'),
    },
    {
      id: 'form',
      content: { kind: 'shot', src: `shots/${heForm.file}`, shot: heForm },
      narration: await narration(
        'תנו לכיתה שם, ואחר כך בחרו שכבה. כשהכול נראה טוב, לחצו על יצירה כדי לשמור.',
        (n) => [
          { word: wordIndex(n, 'שם'), annotation: 0, untilWord: wordIndex(n, 'בחרו') },
          { word: wordIndex(n, 'שכבה'), annotation: 1, untilWord: wordIndex(n, 'לחצו') },
          { word: wordIndex(n, 'יצירה'), annotation: 2 },
        ],
        'he',
      ),
    },
    { id: 'done', content: { kind: 'html', html: heSummary.html } },
  ],
})
writeFileSync(path.join(SITE, 'deck-he.json'), JSON.stringify(hebrew, null, 2))

// Narration with recorded audio, narration spoken live by the browser, and
// the other two kinds of slide content: a host URL and a plain image.
mkdirSync(path.join(SITE, 'audio'), { recursive: true })
const toneSeconds = 2.4
Bun.spawnSync(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `sine=frequency=440:duration=${toneSeconds}`, path.join(SITE, 'audio/tone.wav')])
const recorded = await narration('Recorded narration drives this slide, then it moves on.', (n) => [{ word: wordIndex(n, 'drives'), annotation: 0 }])
writeFileSync(
  path.join(SITE, 'deck-media.json'),
  JSON.stringify(
    Deck.parse({
      title: 'Media',
      slides: [
        {
          id: 'audio',
          content: { kind: 'shot', src: `shots/${listShot.file}`, shot: listShot },
          narration: { ...recorded, audio: 'audio/tone.wav', durationMs: toneSeconds * 1000 },
        },
        {
          id: 'live',
          content: { kind: 'shot', src: `shots/${listShot.file}`, shot: listShot },
          narration: {
            text: 'Spoken live by the browser, choose New class.',
            lang: 'en-GB',
            words: [],
            durationMs: 0,
            audio: null,
            live: true,
            cues: [{ word: 6, annotation: 0 }],
          },
        },
        { id: 'url', content: { kind: 'url', src: 'slide-url.html' } },
        { id: 'image', content: { kind: 'image', src: `shots/${formShot.file}`, alt: 'The new class form' } },
      ],
    }),
  ),
)
writeFileSync(
  path.join(SITE, 'slide-url.html'),
  '<!doctype html><html><body style="margin:0;display:grid;place-content:center;height:100vh;font:48px system-ui"><h1 id="served">Served by the host</h1></body></html>',
)

writeFileSync(path.join(SITE, 'deck.json'), JSON.stringify(deck, null, 2))
writeFileSync(path.join(SITE, 'page.json'), JSON.stringify(fluidPage))
writeFileSync(path.join(SITE, 'page-rtl.json'), JSON.stringify(hebrewPage))
writeFileSync(path.join(SITE, 'page-rtl-div.json'), JSON.stringify(rightToLeftDivPage))
writeFileSync(path.join(SITE, 'page-fixed.json'), JSON.stringify(fixedPage))
// Each browser bundle contains its layer and every layer beneath it, so a
// page loads exactly one of the files the package ships.
const frameManifest = JSON.parse(readFileSync(path.join(ROOT, 'packages/frame/package.json'), 'utf8')) as {
  exports: Record<string, { default: string }>
}
for (const [name, conditions] of Object.entries(frameManifest.exports).filter(([, entry]) => entry.default.startsWith('./dist/browser/'))) {
  const out = name === './browser/headless' ? 'segnavia.js' : `segnavia-${name.replace('./browser/', '')}.js`
  copyFileSync(path.join(ROOT, 'packages/frame', conditions.default), path.join(SITE, out))
}
const shell = (body: string, script = 'segnavia-player.js') =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${deck.title}</title><style>html,body{margin:0;height:100%;background:#e7e7e4}body{padding:24px;box-sizing:border-box}segnavia-player{height:100%}</style></head><body>${body}<script type="module" src="${script}"></script></body></html>`
writeFileSync(path.join(SITE, 'index.html'), shell('<segnavia-player src="deck.json"></segnavia-player>'))
writeFileSync(path.join(SITE, 'media.html'), shell('<segnavia-player id="player" src="deck-media.json" hash="off"></segnavia-player>'))
// Labels are the host's to translate; the Hebrew page passes its own.
writeFileSync(
  path.join(SITE, 'he.html'),
  shell(`<segnavia-player id="player" src="deck-he.json" notes theme="light"></segnavia-player>
    <script type="module">
      await customElements.whenDefined('segnavia-player')
      document.getElementById('player').labels = {
        play: 'הפעלה', pause: 'השהיה', previous: 'השקופית הקודמת', next: 'השקופית הבאה',
        slide: (n, total) => 'שקופית ' + n + ' מתוך ' + total, notes: 'הערות', showNotes: 'הצגת הערות',
        hideNotes: 'הסתרת הערות', enterFullscreen: 'מסך מלא', exitFullscreen: 'יציאה ממסך מלא', player: 'נגן שקופיות',
      }
    </script>`),
)
// A host that draws its own controls: the headless stage and controller only,
// styled entirely by the host, with the skin never loaded.
writeFileSync(
  path.join(SITE, 'headless.html'),
  shell(
    `<style>
      .host-ui{display:grid;grid-template-rows:1fr auto auto;gap:12px;height:100%;font:16px Georgia,serif;color:#222}
      segnavia-stage{border:4px solid rgb(200, 30, 30);border-radius:0;--segnavia-annotation-color:rgb(0, 128, 0);max-height:100%}
      .host-ui nav{display:flex;gap:8px}.host-ui button{font:inherit;padding:6px 14px;border:2px solid #222;background:#fff;cursor:pointer}
      .host-ui output{min-height:1.5em}.host-ui mark{background:#bde}
    </style>
    <div class="host-ui"><segnavia-stage id="stage" src="deck.json" hash="off"></segnavia-stage>
      <output id="caption"></output>
      <nav><button id="previous">Back</button><button id="play">Play</button><button id="next">Forward</button><span id="where"></span></nav></div>
    <script type="module">
      await customElements.whenDefined('segnavia-stage')
      const stage = document.getElementById('stage')
      const controller = stage.controller
      document.getElementById('previous').onclick = () => controller.previous()
      document.getElementById('next').onclick = () => controller.next()
      document.getElementById('play').onclick = () => controller.toggle()
      controller.addEventListener('change', ({ detail: state }) => {
        document.getElementById('where').textContent = (state.index + 1) + ' of ' + state.deck.slides.length
        document.getElementById('play').textContent = state.playing ? 'Stop' : 'Play'
        const words = state.slide?.narration?.text.split(' ') ?? []
        document.getElementById('caption').innerHTML = words.map((w, i) => i === state.word ? '<mark>' + w + '</mark>' : w).join(' ')
      })
    </script>`,
    'segnavia.js',
  ),
)
// A host mixing its own controls with the styled components, which find the
// stage by id and follow the host's colour scheme and accent.
writeFileSync(
  path.join(SITE, 'components.html'),
  shell(
    `<style>
      body{color-scheme:dark;background:#101114}
      .host-ui{display:grid;grid-template-rows:1fr auto auto;gap:12px;height:100%;--segnavia-accent:rgb(230, 120, 40)}
      segnavia-stage{max-height:100%}
      .host-ui nav{display:flex;align-items:center;gap:10px}
      #mine{font:14px system-ui;padding:6px 12px;border-radius:6px;border:1px solid #555;background:#222;color:#eee}
      segnavia-track{flex:1}
    </style>
    <div class="host-ui"><segnavia-stage id="stage" src="deck.json" hash="off"></segnavia-stage>
      <segnavia-caption for="stage"></segnavia-caption>
      <nav><segnavia-play for="stage"></segnavia-play><button id="mine">My own button</button><segnavia-step to="next" for="stage"></segnavia-step>
        <segnavia-track for="stage"></segnavia-track><segnavia-counter for="stage"></segnavia-counter><segnavia-fullscreen for="stage"></segnavia-fullscreen></nav></div>
    <script type="module">
      await customElements.whenDefined('segnavia-stage')
      document.getElementById('mine').onclick = () => document.getElementById('stage').controller.go(3)
    </script>`,
    'segnavia-controls.js',
  ),
)
// Completely headless: no styles from the library at all, not even geometry.
writeFileSync(path.join(SITE, 'unstyled.html'), shell('<segnavia-stage id="bare" src="deck.json" hash="off" unstyled></segnavia-stage>', 'segnavia.js'))
writeFileSync(path.join(SITE, 'notes.html'), shell('<segnavia-player src="deck.json" notes theme="light" hash="step-"></segnavia-player>'))
writeFileSync(
  path.join(SITE, 'page.html'),
  shell(
    '<div style="background:#fff;max-width:900px"><segnavia-page id="fluid" src="page.json"></segnavia-page><segnavia-page id="rtl" src="page-rtl.json"></segnavia-page><segnavia-page id="rtl-div" src="page-rtl-div.json"></segnavia-page><segnavia-page id="fixed" src="page-fixed.json"></segnavia-page></div>',
  ),
)
const schemas = path.join(OUT, 'schema')
mkdirSync(schemas, { recursive: true })
for (const [name, schema] of Object.entries(jsonSchemas())) writeFileSync(path.join(schemas, `${name}.schema.json`), JSON.stringify(schema, null, 2))

const printable = {
  ...deck,
  slides: deck.slides.map((slide) =>
    slide.content.kind === 'shot-ref' ? { ...slide, content: { kind: 'shot' as const, src: `shots/${formShot.file}`, shot: formShot } } : slide,
  ),
}
writeFileSync(path.join(SITE, 'deck-print.json'), JSON.stringify(printable))
const scripted = Deck.parse({
  title: 'Scripts allowed',
  scripts: 'sandboxed',
  slides: [
    {
      id: 'runs',
      content: {
        kind: 'html',
        html: '<h1 id="t">waiting</h1><script>document.getElementById("t").textContent = "ran"; document.body.style.background = "rgb(0, 128, 0)"</script>',
      },
    },
    { id: 'next', content: { kind: 'html', html: '<h1>second</h1>' } },
  ],
})
writeFileSync(path.join(SITE, 'deck-scripted.json'), JSON.stringify(scripted))
writeFileSync(path.join(SITE, 'scripted.html'), shell('<segnavia-player src="deck-scripted.json" hash="off"></segnavia-player>'))
writeFileSync(path.join(SITE, 'prefetch.html'), shell('<segnavia-player id="d" src="deck.json" prefetch></segnavia-player>'))
// A page the host serves itself, as a preview ticket would be: its own CSP,
// and the bridge included under the host's nonce to report its height.
writeFileSync(
  path.join(SITE, 'ticket-page.html'),
  `<!doctype html><html><head><meta charset="utf-8"><script>${bridgeForHost({ relayKeys: false })}</script></head><body style="margin:0"><div style="height:420px;background:#fde68a">served by the host</div></body></html>`,
)
writeFileSync(
  path.join(SITE, 'ticket.html'),
  shell(
    '<div style="background:#fff;width:800px"><segnavia-page id="ticket"></segnavia-page></div><script type="module">await customElements.whenDefined("segnavia-page"); document.getElementById("ticket").showUrl("ticket-page.html")</script>',
  ),
)

const renderer = await openRenderer({ executablePath: CHROMIUM, jsHeapMb: 128 })
const inline = (src: string) => `data:image/webp;base64,${readFileSync(path.join(SITE, src)).toString('base64')}`
try {
  writeFileSync(path.join(OUT, 'deck.pdf'), await renderer.deckPdf(printable, { inline }))
  writeFileSync(path.join(OUT, 'deck-he-notes.pdf'), await renderer.deckPdf(hebrew, { inline, layout: 'notes' }))
  writeFileSync(
    path.join(OUT, 'deck-notes.pdf'),
    await renderer.deckPdf(printable, { inline, layout: 'notes', notesPaper: { paper: 'a4', orientation: 'portrait' } }),
  )
  writeFileSync(path.join(OUT, 'slide-3.png'), await renderer.slideImage(printable, 2, { inline }))
  writeFileSync(path.join(OUT, 'page.webp'), await renderer.pageImage(fluidPage, { format: 'webp', width: 1024 }))
  writeFileSync(path.join(OUT, 'page-fixed.jpeg'), await renderer.pageImage(fixedPage, { format: 'jpeg' }))
  writeFileSync(path.join(OUT, 'page-letter.pdf'), await renderer.pagePdf(marginPage))
  writeFileSync(path.join(OUT, 'page-rtl.pdf'), await renderer.pagePdf(hebrewPage))
  let measured = 0
  await renderer.pagePdf(fluidPage, {
    beforeOutput: async (tab) => {
      measured = await tab.evaluate(() => document.querySelectorAll('p').length)
    },
  })
  writeFileSync(path.join(OUT, 'measured.txt'), String(measured))
  const refused = await renderer.deckPdf(printable, { inline, limits: { maxSheets: 2 } }).then(
    () => 'rendered',
    (error) => (error instanceof RenderRefusedError ? error.message : `unexpected ${error}`),
  )
  writeFileSync(path.join(OUT, 'limits.txt'), refused)
} finally {
  await renderer.close()
}
console.log(`deck: ${deck.slides.length} slides; site, PDFs, images and schemas in out/`)
