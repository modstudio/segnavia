import type { Harness } from './harness.ts'

const PLAYER = 'segnavia-player'

export async function railGeometry(h: Harness, file: string) {
  await h.page.goto(h.url(file))
  await h.waitFor(PLAYER, (data) => data.slide === '1')
  return h.page.locator(PLAYER).evaluate((player) => {
    const root = player.shadowRoot as ShadowRoot
    const box = (selector: string) => (root.querySelector(selector) as HTMLElement).getBoundingClientRect()
    const rail = box('segnavia-rail')
    const screen = box('.screen')
    const transport = box('.center')
    const actions = root.querySelector('.actions') as HTMLElement
    const actionsBox = actions.offsetHeight > 0 ? actions.getBoundingClientRect() : null
    return {
      rail: { left: rail.left, right: rail.right, top: rail.top, bottom: rail.bottom },
      screen: { left: screen.left, right: screen.right },
      transportBottom: transport.bottom,
      actionsTop: actionsBox?.top ?? null,
    }
  })
}

export async function playerGeometry(h: Harness, file: string, width: number) {
  await h.page.setViewportSize({ width, height: 816 })
  await h.page.goto(h.url(file))
  await h.waitFor(PLAYER, (data) => data.slide === '1')
  return h.page.locator(PLAYER).evaluate((player) => {
    const stage = player.shadowRoot?.querySelector('segnavia-stage') as HTMLElement
    const screen = player.shadowRoot?.querySelector('.screen') as HTMLElement
    const playerBox = player.getBoundingClientRect()
    const stageBox = stage.getBoundingClientRect()
    const screenBox = screen.getBoundingClientRect()
    return {
      player: { width: playerBox.width, height: playerBox.height },
      screen: { width: screenBox.width, height: screenBox.height },
      stage: { width: stageBox.width, height: stageBox.height },
    }
  })
}
