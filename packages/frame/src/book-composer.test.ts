import { describe, expect, test } from 'bun:test'
import { bookDocument, parseBookFixture } from '@segnavia/html'
import { MESSAGE } from './bridge.ts'
import {
  appendMeasuredBlock,
  COMPOSE_FAILURE_ATTRIBUTE,
  COMPOSED_ATTRIBUTE,
  composerScript,
  decideBookMeasurement,
  embeddedComposerFunctions,
  flowSectionNumbering,
  inlineTileCount,
  noteFragmentExtent,
  noteSettlementOverlapsBody,
  noteStackTops,
  pageReferenceFolio,
  partTitleValues,
  unmeasuredFlows,
} from './composer.ts'
import { embeddedPreflightFunctions, PREFLIGHT_ATTRIBUTE } from './composer-preflight.ts'

test('embedded region geometry includes its physical-margin dependency', () => {
  const embedded = new Function(`${embeddedComposerFunctions()};return regionBox`)() as (
    edge: 'blockStart',
    margin: { blockStart: number; blockEnd: number; inlineStart: number; inlineEnd: number },
    area: { width: number; height: number },
    side: { direction: 'rtl'; face: 'recto' },
  ) => { top: number; left: number; width: number; height: number }

  expect(
    embedded('blockStart', { blockStart: 10, blockEnd: 10, inlineStart: 30, inlineEnd: 40 }, { width: 100, height: 200 }, { direction: 'rtl', face: 'recto' }),
  ).toEqual({ top: 0, left: 40, width: 100, height: 10 })
})

test('publishes preflight from the embedded functions alone, given the measured flows', () => {
  const posted: unknown[] = []
  const attributes: Record<string, string> = {}
  const failures: string[] = []
  const publish = new Function(
    'config',
    'planFolios',
    'preflightEntries',
    'preflightFits',
    'fail',
    'window',
    'document',
    `${embeddedPreflightFunctions()};return publishPreflight`,
  )(
    { preflight: { 'region-overset': 'error' } },
    { folios: ['1'] },
    [{ check: 'region-overset', subject: 'body:main', message: 'shorten it' }],
    [],
    (reason: string) => failures.push(reason),
    { parent: { postMessage: (message: unknown) => posted.push(message) } },
    { documentElement: { setAttribute: (name: string, value: string) => (attributes[name] = value) } },
  ) as (plan: unknown, flows: unknown) => boolean
  const flows = [{ id: 'chapter', kind: 'chapter', blocks: [{ id: 'held', lines: [{ top: 0, bottom: 10 }] }] }]

  expect(publish({ pages: [{ flow: 'chapter', windows: [{ flow: 'chapter', start: 0, end: 10 }] }] }, flows)).toBe(false)
  expect(JSON.parse(attributes[PREFLIGHT_ATTRIBUTE] ?? '{}').facts.pages).toEqual([{ folio: '1', first: 'held', last: 'held' }])
  expect(posted).toHaveLength(1)
  expect(failures).toEqual(['shorten it'])
})

test('wraps composer start-up exceptions in a bounded failure report', () => {
  const script = composerScript('{}')
  const declarations = script.indexOf('var readyImages=')
  const start = script.indexOf('try{\nvar geometryByName=', declarations)
  const geometry = script.indexOf('var configuredGeometries=config.geometries', start)
  const report = script.lastIndexOf('catch(error){fail(error instanceof Error?error.message:String(error));}')

  expect(start).toBeGreaterThan(declarations)
  expect(geometry).toBeGreaterThan(start)
  expect(report).toBeGreaterThan(geometry)
  expect(script).toContain(`String(reason).slice(0,1024);document.documentElement.setAttribute('${COMPOSE_FAILURE_ATTRIBUTE}'`)
})

test('collects overset entries only when preflight is enabled', () => {
  const script = composerScript('{}')
  expect(script).toContain("if(config.preflight){var furnitureRegions=pages.querySelectorAll('[data-segnavia-region]')")
  expect(script).toContain("if(config.preflight){var paper=filled[t].closest('['+config.pageMarker+']');markRegionOverflow")
})

test('publishes preflight before refusing or marking composition complete', () => {
  const script = composerScript('{}')
  const publish = script.indexOf(`setAttribute('${PREFLIGHT_ATTRIBUTE}',json)`)
  const post = script.indexOf(`postMessage({type:'${MESSAGE.preflight}',report:report}`, publish)
  const refusal = script.indexOf('var refusal=preflightRefusal(report)', post)
  const composed = script.lastIndexOf(`setAttribute('${COMPOSED_ATTRIBUTE}','')`)
  expect(publish).toBeGreaterThan(0)
  expect(post).toBeGreaterThan(publish)
  expect(refusal).toBeGreaterThan(post)
  expect(composed).toBeGreaterThan(refusal)
})

test('keeps one progress high-water across the note-overlap repair composition', () => {
  const script = composerScript('{}')
  const highWater = script.indexOf('var progressHighWater;')
  const compose = script.indexOf('var compose=async function')
  const repair = script.indexOf('composed=await compose(prepared,input.geometry.noteSeries||[])', compose + 1)
  expect(highWater).toBeGreaterThan(0)
  expect(script.indexOf('var progressHighWater;', highWater + 1)).toBe(-1)
  expect(compose).toBeGreaterThan(highWater)
  expect(script.indexOf('dressPlanPages(plan,config.only,reportComposeProgress', compose)).toBeGreaterThan(compose)
  expect(repair).toBeGreaterThan(compose)
})

function startTagElement(tag: string): Pick<Element, 'getAttribute'> {
  return {
    getAttribute(name: string) {
      const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)
      return match?.[1] ?? null
    },
  }
}

const facts = {
  hasLayout: true,
  flows: [{ id: 'chapter-1', sourceBlocks: 1, contentBlocks: 1, measuredLines: 1 }],
  plannedPages: 1,
  visibleElapsedMs: 0,
}

test('composer reads the section numbering attributes written by the book document', () => {
  const book = parseBookFixture({
    title: 'Book',
    mode: 'paginated',
    page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 12, inlineEnd: 12 } },
    chapters: [
      { id: 'cover', title: 'Cover', html: '<p>Cover</p>', numbering: { counted: false } },
      { id: 'text', title: 'Text', html: '<p>Text</p>', numbering: { restart: 4 } },
    ],
  })
  const html = bookDocument(book).html
  const cover = html.match(/<section[^>]*id="cover"(?:\s[^>]*)?>/)?.[0]
  const text = html.match(/<section[^>]*id="text"(?:\s[^>]*)?>/)?.[0]
  expect(cover).toBeDefined()
  expect(text).toBeDefined()
  expect(flowSectionNumbering(startTagElement(cover ?? ''))).toEqual({ counted: false, restart: undefined })
  expect(flowSectionNumbering(startTagElement(text ?? ''))).toEqual({ counted: undefined, restart: 4 })
})

describe('decideBookMeasurement', () => {
  test('retries a galley without layout without charging visible time', () => {
    expect(decideBookMeasurement({ ...facts, hasLayout: false, visibleElapsedMs: 999 }, 1_000)).toBe('retry')
    expect(decideBookMeasurement({ ...facts, hasLayout: false, visibleElapsedMs: 1_000 }, 1_000)).toBe('retry')
  })

  test('retries deferred line measurement and page planning within the bound', () => {
    expect(
      decideBookMeasurement({ ...facts, flows: [{ id: 'chapter-1', sourceBlocks: 1, contentBlocks: 1, measuredLines: 0 }], visibleElapsedMs: 999 }, 1_000),
    ).toBe('retry')
    expect(decideBookMeasurement({ ...facts, plannedPages: 0, visibleElapsedMs: 999 }, 1_000)).toBe('retry')
  })

  test('composes measured or empty source content', () => {
    expect(decideBookMeasurement(facts, 1_000)).toBe('compose')
    expect(decideBookMeasurement({ ...facts, flows: [{ id: 'cover', sourceBlocks: 0, contentBlocks: 0, measuredLines: 0 }], plannedPages: 0 }, 1_000)).toBe(
      'compose',
    )
  })

  test('refuses deferred line measurement or page planning at the bound', () => {
    expect(
      decideBookMeasurement({ ...facts, flows: [{ id: 'chapter-1', sourceBlocks: 1, contentBlocks: 1, measuredLines: 0 }], visibleElapsedMs: 1_000 }, 1_000),
    ).toBe('refuse')
    expect(decideBookMeasurement({ ...facts, plannedPages: 0, visibleElapsedMs: 1_000 }, 1_000)).toBe('refuse')
  })

  test('defers while any source flow has no measured lines', () => {
    const flows = [
      { id: 'chapter-1', sourceBlocks: 2, contentBlocks: 2, measuredLines: 20 },
      { id: 'chapter-2', sourceBlocks: 3, contentBlocks: 3, measuredLines: 0 },
    ]
    expect(decideBookMeasurement({ ...facts, flows, visibleElapsedMs: 999 }, 1_000)).toBe('retry')
    expect(decideBookMeasurement({ ...facts, flows, visibleElapsedMs: 1_000 }, 1_000)).toBe('refuse')
  })

  test('composes when an empty source flow sits beside a measured flow', () => {
    const flows = [
      { id: 'chapter-1', sourceBlocks: 2, contentBlocks: 2, measuredLines: 20 },
      { id: 'chapter-2', sourceBlocks: 2, contentBlocks: 0, measuredLines: 0 },
    ]
    expect(decideBookMeasurement({ ...facts, flows, visibleElapsedMs: 1_000 }, 1_000)).toBe('compose')
  })

  test('composes a book whose only flows are empty', () => {
    const flows = [
      { id: 'chapter-1', sourceBlocks: 2, contentBlocks: 0, measuredLines: 0 },
      { id: 'chapter-2', sourceBlocks: 1, contentBlocks: 0, measuredLines: 0 },
    ]
    expect(decideBookMeasurement({ ...facts, flows, plannedPages: 0, visibleElapsedMs: 1_000 }, 1_000)).toBe('compose')
  })

  test('ignores fixed flows beside measured source flows', () => {
    const flows = [
      { id: 'cover', sourceBlocks: 0, contentBlocks: 0, measuredLines: 0 },
      { id: 'chapter-1', sourceBlocks: 2, contentBlocks: 2, measuredLines: 20 },
      { id: 'back-cover', sourceBlocks: 0, contentBlocks: 0, measuredLines: 0 },
    ]
    expect(decideBookMeasurement({ ...facts, flows }, 1_000)).toBe('compose')
  })
})

describe('block keeps', () => {
  test('a previous keep becomes a next keep on the preceding block of its flow', () => {
    const first = {}
    const held = { keepWithPrevious: true }
    const blocks: Array<{ keepWithNext?: boolean; keepWithPrevious?: boolean }> = [first]
    appendMeasuredBlock(blocks, held)
    expect(blocks).toEqual([{ keepWithNext: true }, {}])
  })

  test('composer measures forced breaks on both block edges', () => {
    const script = composerScript('{}')
    expect(script).toContain('if(forcedPageBreak(style.breakBefore))block.breakBefore=true')
    expect(script).toContain('if(forcedPageBreak(style.breakAfter))block.breakAfter=true')
    expect(script).toContain("if(forcedPageBreak(childStyle.breakBefore))held.style.breakBefore='auto'")
    expect(script).toContain("if(forcedPageBreak(childStyle.breakAfter))held.style.breakAfter='auto'")
  })

  test('section-title variables read the continuing boundary title', () => {
    const script = composerScript('{}')
    expect(script).toContain("block.hasAttribute('data-segnavia-section-title')")
    const book = parseBookFixture({
      title: 'Book',
      mode: 'paginated',
      page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 12, inlineEnd: 12 } },
      chapters: [
        { title: 'One', html: '<p>First</p>' },
        { title: 'Two', opens: 'continue', html: '<p>Second</p>' },
      ],
    })
    expect(bookDocument(book).html).toContain('data-segnavia-section-title="Two" data-segnavia-chapter="2" id="section-2">Two</div>')
  })

  test('part-title variables set and clear the first line of each flow', () => {
    const variables = [
      { name: 'part', kind: 'text' as const, from: 'part-title' as const, part: 'part', pick: 'first' as const },
      { name: 'topic', kind: 'text' as const, from: 'content' as const, pick: 'first' as const },
    ]
    expect(partTitleValues(variables, { part: 'Opening Part' })).toEqual([{ name: 'part', value: 'Opening Part', line: 0, scope: 'flow' }])
    expect(partTitleValues(variables, {})).toEqual([{ name: 'part', value: '', line: 0, scope: 'flow' }])
    expect(composerScript('{}')).toContain('flowStarted?partTitleValues(config.variables||[],parts):[]')
  })

  test('part-title variables ignore inherited names', () => {
    const variables = [{ name: 'part', kind: 'text' as const, from: 'part-title' as const, part: 'constructor', pick: 'first' as const }]
    expect(partTitleValues(variables, {})).toEqual([{ name: 'part', value: '', line: 0, scope: 'flow' }])
  })

  test('takes the page marker from config', () => {
    const script = composerScript('{"pageMarker":"data-segnavia-printed-page"}')
    expect(script).not.toContain('data-segnavia-book-page')
  })

  test('holds note clones at the measured text width', () => {
    const script = composerScript('{}')
    expect(script).toContain("clone.style.inlineSize=inlineSize+'px'")
    expect(script).toContain('holdNote(root,fragments[i].start!==0,textArea.width)')
  })

  test('waits for faces requested by established layout before measuring', () => {
    const script = composerScript('{}')
    const layout = script.indexOf('if(!hasLayout)return nextLayoutFrame().then(composeWhenMeasurable)')
    const fonts = script.indexOf('if(!layoutFontsReady)return (document.fonts?document.fonts.ready:Promise.resolve())', layout)
    const measurement = script.indexOf('var input=measureInput()', fonts)
    expect(layout).toBeGreaterThan(-1)
    expect(fonts).toBeGreaterThan(layout)
    expect(measurement).toBeGreaterThan(fonts)
  })

  test('loads every declared face after document load and before composition', () => {
    const script = composerScript('{"fontLoads":[{"font":"body","sample":"A"}]}')
    const loaded = script.indexOf('var loaded=')
    const fontLoads = script.indexOf('var fontLoads=loaded.then', loaded)
    const fontsReady = script.indexOf('var fontsReady=fontLoads.then(function(){return document.fonts?document.fonts.ready:undefined;})', fontLoads)
    const wait = script.indexOf('Promise.all([loaded,', fontsReady)
    const compose = script.indexOf('var composeWhenMeasurable=async function()', wait)
    expect(script).toContain('loadDeclaredFonts')
    expect(script).toContain("'data-segnavia-font-failures',64,256")
    expect(loaded).toBeGreaterThan(-1)
    expect(fontLoads).toBeGreaterThan(loaded)
    expect(fontsReady).toBeGreaterThan(fontLoads)
    expect(wait).toBeGreaterThan(fontsReady)
    expect(compose).toBeGreaterThan(wait)
  })

  test('replans from settled note metrics before replacing an overlapping composition', () => {
    const script = composerScript('{}')
    const convergence = script.indexOf('var planConverged=function()')
    const preparation = script.indexOf('var preparePlan=function(source)')
    const overlap = script.indexOf("if(settlement==='overlap'&&!config.plan)")
    const remeasure = script.indexOf('input=measureInput();var repaired=planConverged()', overlap)
    const remove = script.indexOf('composed.remove()', remeasure)
    const secondMeasure = script.indexOf('input=measureInput();plan=repaired;prepared=preparePlan(plan)', remove)
    const compose = script.indexOf('composed=await compose(prepared,input.geometry.noteSeries||[])', remove)
    expect(convergence).toBeGreaterThan(-1)
    expect(preparation).toBeGreaterThan(convergence)
    expect(overlap).toBeGreaterThan(-1)
    expect(remeasure).toBeGreaterThan(overlap)
    expect(remove).toBeGreaterThan(remeasure)
    expect(secondMeasure).toBeGreaterThan(remove)
    expect(compose).toBeGreaterThan(secondMeasure)
    expect(script).toContain("document.querySelectorAll('[data-segnavia-galleys] [data-segnavia-flow]')")
    expect(script).toContain("document.querySelectorAll('[data-segnavia-galleys] [data-segnavia-note]')")
  })
})

test('counts inline paper tiles from the measured extent', () => {
  expect(inlineTileCount(100, 100)).toBe(1)
  expect(inlineTileCount(250, 100)).toBe(3)
})

test('lists exactly the unmeasured source flows in order', () => {
  expect(
    unmeasuredFlows([
      { id: 'cover', sourceBlocks: 0, contentBlocks: 0, measuredLines: 0 },
      { id: 'chapter-1', sourceBlocks: 2, contentBlocks: 2, measuredLines: 0 },
      { id: 'empty', sourceBlocks: 2, contentBlocks: 0, measuredLines: 0 },
      { id: 'chapter-2', sourceBlocks: 3, contentBlocks: 3, measuredLines: 12 },
      { id: 'chapter-3', sourceBlocks: 1, contentBlocks: 1, measuredLines: 0 },
    ]),
  ).toEqual(['chapter-1', 'chapter-3'])
})

test('derives a note fragment extent from its own settled line boxes', () => {
  const lines = [
    { top: 2, bottom: 24 },
    { top: 29, bottom: 51 },
    { top: 56, bottom: 78 },
  ]
  expect(noteFragmentExtent(lines, 0, 1)).toEqual({ start: 2, end: 26.5 })
  expect(noteFragmentExtent(lines, 1, 2)).toEqual({ start: 26.5, end: 53.5 })
  expect(noteFragmentExtent(lines, 1, 3)).toEqual({ start: 26.5, end: 78 })
  expect(noteFragmentExtent(lines, 3, 4)).toBeUndefined()
})

test('stacks settled note pieces from the bottom and refuses only a new body overlap', () => {
  const plannedTop = noteStackTops(600, [
    { gap: 10, height: 40 },
    { gap: 5, height: 45 },
  ])[0]
  const settledTop = noteStackTops(600, [
    { gap: 10, height: 60 },
    { gap: 5, height: 55 },
  ])[0]
  expect(plannedTop).toBe(510)
  expect(settledTop).toBe(480)
  expect(noteSettlementOverlapsBody(plannedTop ?? Number.NaN, settledTop ?? Number.NaN, 490)).toBeTrue()
  expect(noteSettlementOverlapsBody(settledTop ?? Number.NaN, settledTop ?? Number.NaN, 490)).toBeFalse()
  expect(noteSettlementOverlapsBody(500, 499.6, 510)).toBeFalse()
  expect(noteSettlementOverlapsBody(500, 480, 470)).toBeFalse()
})

test('refuses a page reference beyond the computed folios', () => {
  expect(
    pageReferenceFolio(
      'appendix',
      501,
      Array.from({ length: 500 }, (_, index) => ({ number: index + 1, text: String(index + 1) })),
    ),
  ).toEqual({
    refusal: 'page reference target appendix lands on page 501, beyond the 500 computed folios; shorten the book to 500 pages or fewer to clear this refusal',
  })
})

test('renders no contents folio for an uncounted target', () => {
  expect(pageReferenceFolio('cover', 1, [null, 'i'])).toEqual({ folio: '' })
  expect(pageReferenceFolio('contents', 2, [null, 'i'])).toEqual({ folio: 'i' })
})
