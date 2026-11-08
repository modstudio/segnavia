import { describe, expect, test } from 'bun:test'
import {
  appendMeasuredBlock,
  composerScript,
  decideBookMeasurement,
  inlineTileCount,
  measuredBlockConstraints,
  measuredKeepRuns,
  noteFragmentExtent,
  noteSettlementOverlapsBody,
  noteStackTops,
  pageReferenceFolio,
  unmeasuredFlows,
} from './composer.ts'

const facts = {
  hasLayout: true,
  flows: [{ id: 'chapter-1', sourceBlocks: 1, contentBlocks: 1, measuredLines: 1 }],
  plannedPages: 1,
  visibleElapsedMs: 0,
}

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

  test('composer reads standard and custom keeps in both directions', () => {
    const script = composerScript('{}')
    expect(script).toContain("style.breakAfter==='avoid'||style.pageBreakAfter==='avoid'||keepWith==='next'")
    expect(script).toContain("style.breakBefore==='avoid'||style.pageBreakBefore==='avoid'||keepWith==='previous'")
  })

  test('composer measures forced breaks on both block edges', () => {
    const script = composerScript('{}')
    expect(script).toContain('if(forcedPageBreak(style.breakBefore))block.breakBefore=true')
    expect(script).toContain('if(forcedPageBreak(style.breakAfter))block.breakAfter=true')
    expect(script).toContain("if(forcedPageBreak(childStyle.breakBefore))held.style.breakBefore='auto'")
    expect(script).toContain("if(forcedPageBreak(childStyle.breakAfter))held.style.breakAfter='auto'")
  })

  test('a row with break-inside avoid produces its line run while empty CSS produces none', () => {
    const lines = [
      { top: 0, bottom: 10 },
      { top: 10, bottom: 20 },
      { top: 20, bottom: 30 },
    ]
    expect(measuredKeepRuns(lines, [{ avoid: true, top: 0, bottom: 30 }])).toEqual([{ start: 0, end: 3 }])
    expect(measuredKeepRuns(lines, [{ avoid: false, top: 0, bottom: 20 }])).toEqual([])
  })

  test('a display table element carries no orphan or widow constraint', () => {
    expect(measuredBlockConstraints('table', 2, 2)).toEqual({})
    expect(measuredBlockConstraints('block', 2, 3)).toEqual({ orphans: 2, widows: 3 })
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

  test('replans from settled note metrics before replacing an overlapping composition', () => {
    const script = composerScript('{}')
    const overlap = script.indexOf("if(settlement==='overlap'&&!config.plan)")
    const remeasure = script.indexOf('input=measureInput();var repaired=planBookOrFail(input)', overlap)
    const remove = script.indexOf('composed.remove()', remeasure)
    const compose = script.indexOf('composed=compose(prepared,input.geometry.noteSeries||[])', remove)
    expect(overlap).toBeGreaterThan(-1)
    expect(remeasure).toBeGreaterThan(overlap)
    expect(remove).toBeGreaterThan(remeasure)
    expect(compose).toBeGreaterThan(remove)
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
