import { composedFrame } from './composed-frame.ts'
import type { Harness } from './harness.ts'
import { inspectPaginatedBook } from './paginated-inspect.ts'
import { inspectNoteViewGeometry } from './paginated-notes.ts'

export async function verifyTwoPageNoteSeries(h: Harness) {
  await h.page.goto(h.url('book-two-page-series.html'))
  for (const language of ['en', 'he'] as const) {
    const id = `book-two-page-series-${language}`
    const frame = await composedFrame(h, `#${id}`, `The two-page-series frame ${id}`)
    const report = await frame.evaluate(inspectPaginatedBook)
    const groups = await frame.evaluate(() => {
      const declared = Array.from(document.querySelectorAll('[data-segnavia-galley-source] [data-segnavia-notes-galley]')).map((galley) =>
        galley.getAttribute('data-segnavia-note-series'),
      )
      const noteSeries = new Map(
        Array.from(document.querySelectorAll('[data-segnavia-galley-source] [data-segnavia-note]')).map(
          (note) =>
            [
              note.getAttribute('data-segnavia-note') ?? '',
              note.closest('[data-segnavia-notes-galley]')?.getAttribute('data-segnavia-note-series') ?? '',
            ] as const,
        ),
      )
      const pages = Array.from(document.querySelectorAll('[data-segnavia-book-page]')).map((page) =>
        Array.from(page.querySelectorAll('[data-segnavia-page-note]')).map((note) => noteSeries.get(note.getAttribute('data-segnavia-page-note') ?? '') ?? ''),
      )
      const ordered = pages.every((series) => series.every((name, index) => index === 0 || declared.indexOf(series[index - 1] ?? '') <= declared.indexOf(name)))
      const commentaryPages = pages.filter((series) => series.includes('commentary')).length
      const together = pages.some((series) => series.includes('footnote') && series.includes('commentary'))
      const pointed = Array.from(document.querySelectorAll('[data-segnavia-page-note]')).some(
        (view) => noteSeries.get(view.getAttribute('data-segnavia-page-note') ?? '') === 'commentary' && view.textContent?.includes('בְּרֵאשִׁית'),
      )
      return { declared, pages, ordered, commentaryPages, together, pointed }
    })
    h.check(`${id} composes both page series without refusal`, !report.failure && report.notes.length === 2, report.failure ?? JSON.stringify(report.notes))
    h.check(
      `${id} stacks used note groups in declaration order`,
      JSON.stringify(groups.declared) === JSON.stringify(['footnote', 'commentary']) && groups.ordered && groups.together,
      JSON.stringify(groups),
    )
    h.check(`${id} continues the second series in its own group`, groups.commentaryPages > 1, JSON.stringify(groups))
    h.check(
      `${id} places every first note call with its note or continuation`,
      report.notes.every((note) => note.ok),
      JSON.stringify(report.notes),
    )
    const ink = await frame.evaluate(inspectNoteViewGeometry)
    h.check(`${id} keeps every group fragment's ink inside its view`, ink.views > 2 && ink.outside === 0 && ink.empty === 0, ink.detail)
    if (language === 'he') h.check(`${id} keeps pointed Hebrew in the continuing series`, groups.pointed, JSON.stringify(groups))
  }
}
