import { type BoardView, MAX_BOARD_ZOOM } from '@segnavia/format'
import { BOUNDED_WAIT_MS, type Harness } from './harness.ts'

export async function checkBoardToolbar(h: Harness) {
  const toolbar = h.page.locator('segnavia-board-toolbar')
  const board = h.page.locator('segnavia-board')
  await board.evaluate((element) => {
    const value = element as HTMLElement & { zoomTo(zoom: number): void }
    value.zoomTo(1)
  })
  await toolbar.evaluate((element) => {
    const value = element as HTMLElement & { buttonsBeforeViewChange?: HTMLButtonElement[] }
    value.buttonsBeforeViewChange = [...(element.shadowRoot?.querySelectorAll('button') ?? [])]
  })
  await toolbar.locator('[slot="icon-zoom-in"]').click()
  await h.page.waitForFunction(
    () => document.querySelector('segnavia-board-toolbar')?.shadowRoot?.querySelector('[part~="zoom-level"]')?.textContent?.trim() === '125%',
    undefined,
    { timeout: BOUNDED_WAIT_MS },
  )
  const zoomed = await board.evaluate((element) => (element as HTMLElement & { view: BoardView }).view.zoom)
  const level = await toolbar.locator('[part~="zoom-level"]').textContent()
  h.check('the board toolbar zoom-in button changes the board and level text', zoomed === 1.25 && level?.trim() === '125%', JSON.stringify({ zoomed, level }))
  const sameButtons = await toolbar.evaluate((element) => {
    const value = element as HTMLElement & { buttonsBeforeViewChange?: HTMLButtonElement[] }
    const current = [...(element.shadowRoot?.querySelectorAll('button') ?? [])]
    return current.length === value.buttonsBeforeViewChange?.length && current.every((button, index) => button === value.buttonsBeforeViewChange?.[index])
  })
  h.check('the board toolbar keeps its button nodes across view changes', sameButtons, String(sameButtons))

  const zoomInIconAssigned = await toolbar.evaluate((element) => {
    const slot = element.shadowRoot?.querySelector<HTMLSlotElement>('[part~="zoom-in"] slot[name="icon-zoom-in"]')
    return (slot?.assignedNodes().length ?? 0) > 0
  })
  h.check('the board toolbar assigns the demo zoom-in glyph to its icon slot', zoomInIconAssigned, String(zoomInIconAssigned))

  await toolbar.locator('[part~="zoom-level"]').click()
  const reset = await board.evaluate((element) => (element as HTMLElement & { view: BoardView }).view.zoom)
  h.check('the board toolbar level button returns to 100%', reset === 1, String(reset))

  const expected = await board.evaluate((element) => {
    const value = element as HTMLElement & { fitAll(): void; view: BoardView }
    value.fitAll()
    return value.view
  })
  await board.evaluate((element) => {
    const value = element as HTMLElement & { zoomTo(zoom: number): void }
    value.zoomTo(2)
  })
  await toolbar.locator('[slot="icon-fit"]').click()
  const fitted = await board.evaluate((element) => (element as HTMLElement & { view: BoardView }).view)
  h.check('the board toolbar fit button matches fitAll()', JSON.stringify(fitted) === JSON.stringify(expected), JSON.stringify({ fitted, expected }))

  const shares = await toolbar.evaluate((element) => {
    let count = 0
    element.addEventListener('segnavia-board-share', () => count++)
    ;(element.shadowRoot?.querySelector('[part~="share"]') as HTMLButtonElement | null)?.click()
    return count
  })
  h.check('the board toolbar Share button emits one segnavia-board-share event', shares === 1, String(shares))

  const shareHidden = await toolbar.evaluate((element) => {
    element.removeAttribute('shareable')
    const buttons = [...(element.shadowRoot?.querySelectorAll('button') ?? [])]
    buttons.find((button) => !button.disabled && !button.hidden)?.focus()
    const share = element.shadowRoot?.querySelector<HTMLButtonElement>('[part~="share"]')
    return {
      hidden: share?.hidden,
      display: share ? getComputedStyle(share).display : undefined,
      width: share?.getBoundingClientRect().width,
    }
  })
  const arrowTargets: string[] = []
  for (let index = 0; index < 8; index++) {
    await h.page.keyboard.press('ArrowRight')
    arrowTargets.push(await toolbar.evaluate((element) => (element.shadowRoot?.activeElement as HTMLElement | null)?.dataset.action ?? ''))
  }
  h.check(
    'the board toolbar hides an unavailable Share button and skips it during arrow navigation',
    shareHidden.hidden === true && shareHidden.display === 'none' && shareHidden.width === 0 && !arrowTargets.includes('share'),
    JSON.stringify({ shareHidden, arrowTargets }),
  )
  await toolbar.evaluate((element) => element.setAttribute('shareable', ''))

  const zoomIn = toolbar.locator('[part~="zoom-in"]')
  await zoomIn.focus()
  const deadline = Date.now() + BOUNDED_WAIT_MS
  let zoom = await board.evaluate((element) => (element as HTMLElement & { view: BoardView }).view.zoom)
  while (zoom < MAX_BOARD_ZOOM && Date.now() < deadline) {
    await h.page.keyboard.press('Enter')
    zoom = await board.evaluate((element) => (element as HTMLElement & { view: BoardView }).view.zoom)
  }
  await h.page
    .waitForFunction(
      () => {
        const root = document.querySelector('segnavia-board-toolbar')?.shadowRoot
        const zoomIn = root?.querySelector<HTMLButtonElement>('[part~="zoom-in"]')
        const active = root?.activeElement
        return zoomIn?.disabled && active instanceof HTMLButtonElement && !active.disabled && active.tabIndex === 0
      },
      undefined,
      { timeout: BOUNDED_WAIT_MS },
    )
    .catch(() => {})
  const focus = await toolbar.evaluate((element) => {
    const zoomIn = element.shadowRoot?.querySelector<HTMLButtonElement>('[part~="zoom-in"]')
    const active = element.shadowRoot?.activeElement
    return {
      zoomInDisabled: zoomIn?.disabled,
      button: active instanceof HTMLButtonElement,
      disabled: (active as HTMLButtonElement | null)?.disabled,
      tabIndex: (active as HTMLElement | null)?.tabIndex,
    }
  })
  h.check(
    'the board toolbar keeps an enabled tab stop focused when zoom-in becomes disabled',
    Math.abs(zoom - MAX_BOARD_ZOOM) <= 1e-9 && focus.zoomInDisabled === true && focus.button && !focus.disabled && focus.tabIndex === 0,
    JSON.stringify({ zoom, focus }),
  )

  await board.evaluate((element) => (element as HTMLElement & { fitAll(): void }).fitAll())
}
