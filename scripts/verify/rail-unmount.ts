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
    player.setAttribute('rail', '')
    player.style.cssText = 'position:fixed;inset:0;block-size:100vh;inline-size:100%'
    document.body.append(player)
    await player.controller.load(deck)
    const rail = player.shadowRoot?.querySelector('segnavia-rail')
    const list = rail?.shadowRoot?.querySelector('ol')
    if (!list) throw new Error('The desk rail list was not ready.')
    const frames = () => rail?.shadowRoot?.querySelectorAll('iframe').length ?? 0
    const settle = async () => {
      const start = frames()
      await new Promise((resolve) => setTimeout(resolve, 400))
      return { start, next: frames() }
    }
    await settle()
    const atStart = frames()
    list.scrollTop = list.scrollHeight
    await settle()
    const atEnd = frames()
    list.scrollTop = 0
    await settle()
    const back = frames()
    player.remove()
    return { atStart, atEnd, back, max: Math.max(atStart, atEnd, back) }
  }, longDeck())
  check(
    'desk rail keeps mounted thumbnail frames bounded while scrolling first to last',
    counts.max > 0 && counts.max < SLIDE_COUNT / 2 && counts.atEnd < SLIDE_COUNT / 2 && counts.back < SLIDE_COUNT / 2,
    JSON.stringify(counts),
  )
}
