import type { Harness } from './harness.ts'

const PLAYER = 'segnavia-player'
const SLIDE_COUNT = 40

function longDeck() {
  return {
    title: 'Rail unmount',
    slides: Array.from({ length: SLIDE_COUNT }, (_, index) => ({
      id: `rail-${index}`,
      content: { kind: 'html' as const, html: `<h1>${index + 1}</h1>` },
    })),
  }
}

export async function verifyDeskRailUnmount(h: Harness) {
  const { page, check } = h
  await page.setViewportSize({ width: 1000, height: 816 })
  await page.goto(h.url('rail.html'))
  await h.waitFor(PLAYER, (data) => data.slide === '1')
  const counts = await page.evaluate(async (deck) => {
    const existing = document.querySelector(PLAYER)
    existing?.remove()
    const player = document.createElement('segnavia-player') as HTMLElement & {
      controller: { load(input: unknown): Promise<void> }
    }
    document.body.append(player)
    await player.controller.load(deck)
    const rail = document.createElement('segnavia-rail') as HTMLElement & { controller: unknown; refresh(): void }
    rail.style.cssText = 'display:block;position:fixed;inset-block-start:0;inset-inline-start:0;block-size:480px;inline-size:180px'
    document.body.append(rail)
    rail.controller = player.controller
    const list = rail.shadowRoot?.querySelector('ol')
    if (!list) throw new Error('The desk rail list was not ready.')
    const frames = () => rail.shadowRoot?.querySelectorAll('iframe').length ?? 0
    const settle = async () => {
      let previous = -1
      for (let attempt = 0; attempt < 20; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        const next = frames()
        if (next === previous && next > 0) return next
        previous = next
      }
      return frames()
    }
    const atStart = await settle()
    list.scrollTop = list.scrollHeight
    const atEnd = await settle()
    list.scrollTop = 0
    const back = await settle()
    const overflowing = list.scrollHeight > list.clientHeight + 40
    rail.remove()
    player.remove()
    return { atStart, atEnd, back, max: Math.max(atStart, atEnd, back), overflowing }
  }, longDeck())
  check(
    'desk rail keeps mounted thumbnail frames bounded while scrolling first to last',
    counts.overflowing && counts.atStart > 0 && counts.max < SLIDE_COUNT / 2 && counts.atEnd <= counts.atStart + 3 && counts.back <= counts.atStart + 3,
    JSON.stringify(counts),
  )
}
