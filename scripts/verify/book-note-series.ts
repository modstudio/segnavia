import type { Harness } from './harness.ts'

async function seriesFrame(h: Harness, id: string) {
  const element = await h.page.$(`#${id}`)
  const frame = await element?.contentFrame()
  if (!frame) throw new Error(`The note series frame ${id} did not load.`)
  await frame.waitForFunction(
    () => document.documentElement.hasAttribute('data-segnavia-composed') || document.documentElement.hasAttribute('data-segnavia-compose-failure'),
    undefined,
    { timeout: 20_000 },
  )
  return frame
}

export async function verifyNoteSeries(h: Harness) {
  await h.page.goto(h.url('book-note-series.html'))
  for (const language of ['en', 'he'] as const) {
    const id = `book-note-series-${language}`
    const frame = await seriesFrame(h, id)
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
}
