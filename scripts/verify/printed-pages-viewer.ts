import type { Harness } from './harness.ts'

export async function verifyPrintedPagesViewer(h: Harness): Promise<void> {
  const { page, check } = h
  await page.goto(h.url('printed-pages-viewer.html'))
  await page.waitForFunction(() => (window as unknown as { viewer: { pageCount: number } }).viewer?.pageCount >= 12, undefined, { timeout: 20_000 })
  await page.waitForFunction(() => document.querySelectorAll('segnavia-printed-pages iframe').length > 0)
  const initial = await page.evaluate(() => {
    const viewer = (window as unknown as { viewer: HTMLElement & { pageCount: number } }).viewer
    return { count: viewer.pageCount, frames: viewer.querySelectorAll('iframe').length }
  })
  check(
    'the viewer initially composes only papers near its viewport',
    initial.count >= 12 && initial.frames > 0 && initial.frames < initial.count,
    JSON.stringify(initial),
  )

  const afterScroll = await page.evaluate(async () => {
    const viewer = (window as unknown as { viewer: HTMLElement }).viewer
    const first = viewer.querySelector<HTMLElement>('[data-page="1"]')
    viewer.scrollTop = viewer.scrollHeight
    viewer.dispatchEvent(new Event('scroll'))
    await new Promise((resolve) => setTimeout(resolve, 250))
    return { firstFrame: first?.querySelector('iframe') !== null, frames: viewer.querySelectorAll('iframe').length }
  })
  check(
    'scrolling composes the new window and discards papers far behind it',
    !afterScroll.firstFrame && afterScroll.frames < initial.count,
    JSON.stringify(afterScroll),
  )

  const coalesced = await page.evaluate(async () => {
    const viewer = (window as unknown as { viewer: HTMLElement & { page: number; fit: string; zoom: number; layout: string } }).viewer
    viewer.page = 5
    let measurements = 0
    const observer = new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) if (node instanceof HTMLIFrameElement && node.style.opacity === '0') measurements++
    })
    observer.observe(document.body, { childList: true })
    viewer.fit = 'page'
    viewer.zoom = 0.9
    viewer.layout = 'facing'
    await new Promise((resolve) => setTimeout(resolve, 700))
    observer.disconnect()
    return { measurements, page: viewer.page }
  })
  check(
    'three option changes in one task cause one reload and preserve the current page',
    coalesced.measurements === 1 && coalesced.page === 5,
    JSON.stringify(coalesced),
  )

  const facing = await page.evaluate(() => {
    const viewer = (window as unknown as { viewer: HTMLElement }).viewer
    const rect = (page: number) => viewer.querySelector<HTMLElement>(`[data-page="${page}"]`)?.getBoundingClientRect()
    const one = rect(1)
    const two = rect(2)
    const three = rect(3)
    return {
      one: one?.left,
      two: two?.left,
      three: three?.left,
      firstSpreadPages: viewer.querySelector('.segnavia-printed-pages__spread')?.querySelectorAll('[data-page]').length,
    }
  })
  check(
    'RTL facing layout leaves page 1 alone on the left and puts page 2 right of page 3',
    facing.firstSpreadPages === 1 && Number(facing.one) < 450 && Number(facing.two) > Number(facing.three),
    JSON.stringify(facing),
  )

  const zoomOrigin = await page.evaluate(async () => {
    const viewer = (window as unknown as { viewer: HTMLElement & { zoom: number } }).viewer
    viewer.zoom = 0.5
    await new Promise((resolve) => setTimeout(resolve, 700))
    const spread = viewer.querySelector<HTMLElement>('.segnavia-printed-pages__spread')
    const content = spread?.querySelector<HTMLElement>('.segnavia-printed-pages__spread-content')
    return { spread: spread?.getBoundingClientRect().right, content: content?.getBoundingClientRect().right }
  })
  check(
    'RTL zoom keeps the spread content inline-start edge at its spread element inline-start edge',
    Math.abs(Number(zoomOrigin.spread) - Number(zoomOrigin.content)) < 1,
    JSON.stringify(zoomOrigin),
  )

  await page.waitForFunction(() => [...document.querySelectorAll<HTMLIFrameElement>('segnavia-printed-pages iframe')].some((frame) => !frame.style.visibility))
  const failure = await page.evaluate(async () => {
    const viewer = (window as unknown as { viewer: HTMLElement & { fonts: unknown } }).viewer
    const shown = [...viewer.querySelectorAll<HTMLIFrameElement>('iframe')].filter((frame) => !frame.style.visibility)
    viewer.fonts = { source: { font: async () => Promise.reject(new Error('fixture font refusal')) } }
    await new Promise((resolve) => setTimeout(resolve, 300))
    return {
      shown: shown.length,
      after: [...viewer.querySelectorAll<HTMLIFrameElement>('iframe')].filter((frame) => !frame.style.visibility).length,
      retained: shown.every((frame) => frame.isConnected && !frame.style.visibility),
      failure: viewer.hasAttribute('failure'),
      text: viewer.querySelector('[part="failure"]')?.textContent,
    }
  })
  check(
    'a refused option shows an alert while keeping earlier papers visible',
    failure.shown > 0 && failure.after >= failure.shown && failure.retained && failure.failure && Boolean(failure.text),
    JSON.stringify(failure),
  )
}
