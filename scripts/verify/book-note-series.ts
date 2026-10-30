import { composedFrame } from './composed-frame.ts'
import type { Harness } from './harness.ts'
import { verifyTwoPageNoteSeries } from './two-page-note-series.ts'

export async function verifyNoteSeries(h: Harness) {
  await h.page.goto(h.url('book-note-series.html'))
  for (const language of ['en', 'he'] as const) {
    const id = `book-note-series-${language}`
    const frame = await composedFrame(h, `#${id}`, `The note series frame ${id}`)
    const report = await frame.evaluate(() => {
      const first = document.querySelector<HTMLAnchorElement>('#segnavia-fnref-1-1')
      const second = document.querySelector<HTMLAnchorElement>('#segnavia-fnref-2-2')
      const repeated = document.querySelector<HTMLAnchorElement>('[data-segnavia-note-repeat] > a')
      const endCall = document.querySelector<HTMLAnchorElement>('#segnavia-enref-1')
      const endBody = document.querySelector<HTMLAnchorElement>('#segnavia-en-1 > a')
      const pageNotes = Array.from(document.querySelectorAll('[data-segnavia-page-note]')).map((note) => note.getAttribute('data-segnavia-page-note'))
      return {
        markers: [first?.textContent, second?.textContent, endCall?.textContent],
        links: [first?.getAttribute('href'), repeated?.getAttribute('href'), endCall?.getAttribute('href'), endBody?.getAttribute('href')],
        heading: document.querySelector('#segnavia-endnotes .segnavia-endnotes-title')?.textContent,
        pageNotes,
      }
    })
    const expectedMarkers = language === 'he' ? ['א', 'ב', '1'] : ['*', '†', '1']
    const expectedHeading = language === 'he' ? 'הערות' : 'Comments'
    h.check(
      `${id} distinguishes two book-numbered series by marker`,
      JSON.stringify(report.markers) === JSON.stringify(expectedMarkers),
      JSON.stringify(report),
    )
    h.check(
      `${id} links first and repeated calls to one body and the collected note both ways`,
      JSON.stringify(report.links) === JSON.stringify(['#segnavia-fn-1-1', '#segnavia-fn-1-1', '#segnavia-en-1', '#segnavia-enref-1']),
      JSON.stringify(report),
    )
    h.check(`${id} carries the collected series heading`, report.heading === expectedHeading, JSON.stringify(report))
    h.check(
      `${id} composes each page note body once and does not measure the repeated call`,
      JSON.stringify(report.pageNotes) === JSON.stringify(['segnavia-fn-1-1', 'segnavia-fn-2-2']),
      JSON.stringify(report),
    )
  }
  await verifyTwoPageNoteSeries(h)
}
