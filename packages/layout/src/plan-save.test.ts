import { describe, expect, test } from 'bun:test'
import { Plan as SavedPlan } from '@segnavia/format'
import { block, flow, input, settings } from './paginate-book.test-helper.ts'
import { planBook } from './plan-book.ts'
import { replayPlan, savePlan } from './plan-save.ts'

const numbering = { frontMatter: 'roman-lower' as const, body: 'hebrew' as const }

function planned(measurements: ReturnType<typeof input>) {
  const result = planBook(measurements, numbering)
  if (!result.ok) throw new Error(result.refusals[0]?.message)
  return result.plan
}

function hebrewMeasurements() {
  return input({
    settings: { ...settings, direction: 'rtl' },
    flows: [flow('פרק', 'chapter', [block('text', 'p', 1, 1, 12, 0, { id: 'שָׁלוֹם' })])],
  })
}

describe('saved book plans', () => {
  test('saves line-index boundaries for pointed Hebrew and round-trips unchanged pages', () => {
    const measurements = hebrewMeasurements()
    const plan = planned(measurements)
    const saved = savePlan(measurements, plan, numbering)

    expect(saved.pages.map((page) => page.start?.line)).toEqual([0, 5, 10])
    expect(saved.pages[0]?.start).toEqual({ flow: 'פרק', block: 0, line: 0, id: 'שָׁלוֹם' })
    expect(SavedPlan.parse(saved)).toEqual(saved)
    const replayed = replayPlan(measurements, saved, numbering)
    expect(replayed).toEqual({
      ok: true,
      plan: {
        version: 3,
        pages: saved.pages,
        folios: saved.folios,
        total: saved.total,
        documentFolios: saved.documentFolios,
        documentTotal: saved.documentTotal,
        recordTotals: saved.recordTotals,
        records: saved.records,
      },
    })
    if (replayed.ok) expect(replayed.plan.pages).toBe(saved.pages)
  })

  test('refuses the first changed line-box page and names its block', () => {
    const measurements = hebrewMeasurements()
    const saved = savePlan(measurements, planned(measurements), numbering)
    const changed = structuredClone(measurements)
    const chapter = changed.flows[0]
    if (!chapter || chapter.kind === 'fixed') throw new Error('missing flowing fixture')
    const line = chapter.blocks[0]?.lines[6]
    if (!line) throw new Error('missing fixture line')
    line.bottom += 1

    expect(replayPlan(changed, saved, numbering)).toEqual({
      ok: false,
      page: 2,
      refusal: 'page 2 no longer matches the plan: block שָׁלוֹם laid out differently; compute a new plan to clear this refusal',
    })
  })

  test('refuses the page whose saved variable value changed', () => {
    const measurements = input({
      variables: [{ name: 'topic', kind: 'text', from: 'content', pick: 'first' }],
      flows: [
        flow('chapter', 'chapter', [
          block('text', 'p', 1, 1, 12, 0, { id: 'paragraph', variables: [{ name: 'topic', value: 'Before', line: 6 }] }),
        ]),
      ],
    })
    const saved = savePlan(measurements, planned(measurements), numbering)
    const changed = structuredClone(measurements)
    const chapter = changed.flows[0]
    if (!chapter || chapter.kind === 'fixed') throw new Error('missing flowing fixture')
    const setPoint = chapter.blocks[0]?.variables?.[0]
    if (!setPoint) throw new Error('missing variable fixture')
    setPoint.value = 'After'

    expect(replayPlan(changed, saved, numbering)).toEqual({
      ok: false,
      page: 2,
      refusal: 'page 2 no longer matches the plan: block paragraph laid out differently; compute a new plan to clear this refusal',
    })
  })

  test('refuses a line appended after the final saved window', () => {
    const measurements = hebrewMeasurements()
    const saved = savePlan(measurements, planned(measurements), numbering)
    const changed = structuredClone(measurements)
    const chapter = changed.flows[0]
    if (!chapter || chapter.kind === 'fixed') throw new Error('missing flowing fixture')
    chapter.blocks[0]?.lines.push({ top: 120, bottom: 130 })

    expect(replayPlan(changed, saved, numbering)).toEqual({
      ok: false,
      page: 3,
      refusal: 'page 3 no longer matches the plan: block שָׁלוֹם laid out differently; compute a new plan to clear this refusal',
    })
  })

  test('replays a flow whose saved baseline already has an unconsumed line', () => {
    const measurements = hebrewMeasurements()
    const plan = planned(measurements)
    const chapter = measurements.flows[0]
    if (!chapter || chapter.kind === 'fixed') throw new Error('missing flowing fixture')
    chapter.blocks[0]?.lines.push({ top: 120, bottom: 130 })
    const saved = savePlan(measurements, plan, numbering)
    expect(replayPlan(measurements, saved, numbering)).toMatchObject({ ok: true })
  })

  test('refuses a note line appended after its final saved fragment', () => {
    const measurements = input({
      geometry: { textHeight: 50, notesGap: 10 },
      flows: [flow('chapter', 'chapter', [block('text', 'p', 1, 1, 2, 0, { footnoteRefs: [{ note: 'note-1', line: 1 }] })])],
      notes: [{ id: 'note-1', series: 'footnote', lines: Array.from({ length: 6 }, (_, index) => ({ top: index * 10, bottom: (index + 1) * 10 })) }],
    })
    const saved = savePlan(measurements, planned(measurements), numbering)
    const changed = structuredClone(measurements)
    changed.notes[0]?.lines.push({ top: 60, bottom: 70 })

    expect(replayPlan(changed, saved, numbering)).toEqual({
      ok: false,
      page: 2,
      refusal: 'page 2 no longer matches the plan: note note-1 laid out differently; compute a new plan to clear this refusal',
    })
  })

  test('refuses changed settings at page one', () => {
    const measurements = hebrewMeasurements()
    const saved = savePlan(measurements, planned(measurements), numbering)
    const changed = { ...measurements, settings: { ...measurements.settings, widows: 3 } }
    expect(replayPlan(changed, saved, numbering)).toEqual({
      ok: false,
      page: 1,
      refusal: "the plan's inputs changed (settings, geometry, breaks or block order); compute a new plan to clear this refusal",
    })
  })

  test('replays a plan saved with the default-page fingerprint shape', () => {
    const measurements = input({ flows: [flow('legacy', 'chapter', [block('text', 'p', 1, 1, 2, 0, { id: 'paragraph' })])] })
    const saved = SavedPlan.parse({
      version: 3,
      fingerprint: 'fnv1a64:12fd4cd7dfb3778a',
      breaks: [],
      pages: [
        {
          kind: 'body',
          number: 1,
          sequence: 'body',
          flow: 'legacy',
          role: 'opener',
          windows: [{ flow: 'legacy', start: 0, end: 20, top: 0, column: 0, columns: 1 }],
          notes: [],
          blank: false,
          sectionOpening: true,
          marks: {},
          variables: {},
          parent: 'segnavia:opener',
          face: 'recto',
          side: 'right',
          start: { flow: 'legacy', block: 0, line: 0, id: 'paragraph' },
          fingerprint: 'fnv1a64:39011ba41d86eca8',
        },
      ],
      folios: ['א'],
      total: 'א',
      documentFolios: ['א'],
      documentTotal: 'א',
      recordTotals: {},
      records: {},
    })
    expect(replayPlan(measurements, saved, numbering)).toMatchObject({ ok: true })
  })

  test('names the first page whose section geometry changed', () => {
    const measurements = input({
      flows: [flow('one', 'chapter', [block('text', 'p', 1, 1, 2, 0)]), { ...flow('two', 'chapter', [block('text', 'p', 2, 1, 2, 0)]), pageGeometry: 'wide' }],
      pageGeometries: { wide: { width: 800, height: 600 } },
    })
    const saved = savePlan(measurements, planned(measurements), numbering)
    expect(replayPlan(measurements, SavedPlan.parse(saved), numbering).ok).toBe(true)
    const changed = structuredClone(measurements)
    const second = changed.flows[1]
    if (!second) throw new Error('missing second flow')
    delete second.pageGeometry
    const secondPage = saved.pages.findIndex((page) => page.flow === 'two') + 1
    expect(replayPlan(changed, saved, numbering)).toEqual({
      ok: false,
      page: secondPage,
      refusal: `page ${secondPage} no longer matches the plan: page geometry "wide" became undefined; compute a new plan to clear this refusal`,
    })
  })

  test('validates saved starts against fresh measurements at their page', () => {
    const measurements = hebrewMeasurements()
    const saved = savePlan(measurements, planned(measurements), numbering)
    const stale = structuredClone(saved)
    const start = stale.pages[1]?.start
    if (!start) throw new Error('missing saved start')
    start.block = 4
    const replayed = replayPlan(measurements, stale, numbering)
    expect(replayed.ok).toBe(false)
    if (!replayed.ok) {
      expect(replayed.page).toBe(2)
      expect(replayed.refusal).toMatch(/pages.1.start.block.*outside flow.*clear this refusal/)
    }
  })

  test('refuses a saved page whose flow is not measured, before the composer selects by it', () => {
    const measurements = hebrewMeasurements()
    const saved = savePlan(measurements, planned(measurements), numbering)
    const forged = structuredClone(saved)
    const page = forged.pages[1]
    if (!page) throw new Error('missing saved page')
    page.flow = 'other"]'

    expect(replayPlan(measurements, forged, numbering)).toEqual({
      ok: false,
      page: 2,
      refusal: 'pages.1.flow names missing flow "other\\"]"; compute a new plan to clear this refusal',
    })
  })

  test('refuses an in-range saved start that no longer begins its page', () => {
    const measurements = hebrewMeasurements()
    const saved = savePlan(measurements, planned(measurements), numbering)
    const stale = structuredClone(saved)
    const start = stale.pages[1]?.start
    if (!start) throw new Error('missing saved start')
    start.line += 1

    expect(replayPlan(measurements, stale, numbering)).toEqual({
      ok: false,
      page: 2,
      refusal: 'page 2 no longer matches the plan: block שָׁלוֹם laid out differently; compute a new plan to clear this refusal',
    })
  })

  test('records forced break ids and preserves their saved pages', () => {
    const measurements = input({
      flows: [
        flow('chapter', 'chapter', [block('text', 'p', 1, 1, 2, 0, { id: 'before' }), block('text', 'p', 1, 2, 2, 20, { id: 'forced', breakBefore: true })]),
      ],
    })
    const plan = planned(measurements)
    const saved = savePlan(measurements, plan, numbering)
    expect(saved.breaks).toEqual(['forced'])
    expect(saved.pages).toHaveLength(2)
    expect(saved.pages[1]?.start?.id).toBe('forced')
    expect(replayPlan(measurements, saved, numbering)).toMatchObject({ ok: true, plan: { pages: saved.pages } })
  })

  test('omits starts for fixed pages without inventing block identities', () => {
    const measurements = input({ flows: [{ id: 'plates', kind: 'fixed', pages: 2 }] })
    const saved = savePlan(measurements, planned(measurements), numbering)
    expect(saved.pages.map((page) => page.start)).toEqual([undefined, undefined])
    expect(replayPlan(measurements, saved, numbering).ok).toBe(true)
  })
})
