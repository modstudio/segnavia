import type { Harness } from './harness.ts'

const PLAYER = 'segnavia-player'

async function focusStepTrack(h: Harness) {
  await h.page.locator(PLAYER).evaluate((player) => {
    const track = player.shadowRoot?.querySelector('segnavia-track')
    ;(track?.shadowRoot?.querySelector('ol') as HTMLOListElement | null)?.focus()
  })
}

function focusKindSrc() {
  return `function focusKind() {
    let node = document.activeElement
    while (node && node.shadowRoot && node.shadowRoot.activeElement) node = node.shadowRoot.activeElement
    if (!node) return 'none'
    if (node.closest && node.closest('[slot="actions"]')) return 'action'
    if (node.classList && node.classList.contains('notes-toggle')) return 'notes'
    const root = node.getRootNode()
    const host = root instanceof ShadowRoot ? root.host : node
    const tag = host.tagName ? host.tagName.toLowerCase() : ''
    if (tag === 'segnavia-step' && host.getAttribute('to') === 'next') return 'next'
    if (tag === 'segnavia-step') return 'previous'
    if (tag === 'segnavia-play') return 'play'
    if (tag === 'segnavia-mute') return 'mute'
    if (tag === 'segnavia-captions') return 'captions'
    if (tag === 'segnavia-fullscreen') return 'present'
    if (tag === 'segnavia-rail') return 'rail'
    if (tag === 'segnavia-track') return 'track'
    return tag || node.tagName.toLowerCase()
  }`
}

export async function readPlayerFocusKind(h: Harness): Promise<string> {
  return h.page.evaluate((src) => {
    const focusKind = new Function(`return (${src})`)()
    return focusKind() as string
  }, focusKindSrc())
}

export async function verifyStepTrackTabAndLtr(h: Harness) {
  const { page, check } = h
  await page.locator(PLAYER).evaluate((player) => {
    const track = player.shadowRoot?.querySelector('segnavia-track')
    const probe = document.createElement('button')
    probe.dataset.trackTabProbe = ''
    track?.before(probe)
    probe.focus()
  })
  await page.keyboard.press('Tab')
  const enteredTrack = await readPlayerFocusKind(h)
  await page.keyboard.press('Tab')
  const leftTrack = await readPlayerFocusKind(h)
  await page.locator(PLAYER).evaluate((player) => player.shadowRoot?.querySelector('[data-track-tab-probe]')?.remove())
  check(
    'one Tab enters the step track and the next Tab leaves it',
    enteredTrack === 'track' && leftTrack === 'play',
    JSON.stringify({ enteredTrack, leftTrack }),
  )
  await focusStepTrack(h)
  await page.keyboard.press('ArrowRight')
  await h.waitFor(PLAYER, (data) => data.slide === '2')
  check('ArrowRight on the focused step track shows the next slide', (await h.state(PLAYER)).slide === '2')
}

export async function verifyStepTrackRtl(h: Harness) {
  const { page, check } = h
  await focusStepTrack(h)
  const rtlTrack = await page
    .locator(PLAYER)
    .evaluate((player: HTMLElement & { controller: { state: { direction: string; index: number; playback: string } } }) => {
      const list = player.shadowRoot?.querySelector('segnavia-track')?.shadowRoot?.querySelector('ol') as HTMLOListElement | null
      const { direction, index, playback } = player.controller.state
      return { direction, index, playback, listDirection: list?.dir, focused: list !== null && list === (list.getRootNode() as ShadowRoot).activeElement }
    })
  await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(100)
  const rtlState = await h.state(PLAYER)
  const rtlIndex = await page.locator(PLAYER).evaluate((player: HTMLElement & { controller: { state: { index: number } } }) => player.controller.state.index)
  check(
    'ArrowLeft on the focused right-to-left step track shows the next slide',
    rtlIndex === rtlTrack.index + 1,
    JSON.stringify({ rtlTrack, rtlIndex, rtlState }),
  )
}
