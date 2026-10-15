// Window presentation geometry and the caption's presented appearance.

import type { Deck } from '@segnavia/format'
import type { Harness } from './harness.ts'

const PLAYER = 'segnavia-player'

export async function verifyWindowPresentation(h: Harness) {
  const { page, check } = h
  await seekToCaptionStates(h)
  const normalCaption = await captionAppearance(h)
  const beforePresentation = await page.locator(PLAYER).evaluate((player) => {
    const rect = player.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, position: getComputedStyle(player).position, overflow: document.body.style.overflow }
  })
  await page.locator(`${PLAYER} segnavia-stage`).focus()
  await page.keyboard.press('f')
  const presented = await page.locator(PLAYER).evaluate((player) => {
    const rect = player.getBoundingClientRect()
    return {
      marked: player.hasAttribute('data-presenting'),
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      position: getComputedStyle(player).position,
      zIndex: getComputedStyle(player).zIndex,
      overflow: document.body.style.overflow,
    }
  })
  check(
    'f enters window presentation by default and covers the viewport',
    presented.marked &&
      presented.x === 0 &&
      presented.y === 0 &&
      presented.width === presented.viewportWidth &&
      presented.height === presented.viewportHeight &&
      presented.position === 'fixed' &&
      presented.zIndex === '2147483647' &&
      presented.overflow === 'hidden',
    JSON.stringify(presented),
  )
  await page.waitForTimeout(200)
  const presentedCaption = await captionAppearance(h)
  check(
    'presented caption word states each meet 4.5:1 contrast',
    Object.values(presentedCaption.contrast).every((ratio) => ratio >= 4.5),
    JSON.stringify(presentedCaption.contrast),
  )
  check(
    'presentation keeps the caption font size unchanged',
    presentedCaption.fontSize === normalCaption.fontSize,
    `${normalCaption.fontSize}px -> ${presentedCaption.fontSize}px`,
  )
  await page.keyboard.press('Escape')
  const restored = await page.locator(PLAYER).evaluate((player) => {
    const rect = player.getBoundingClientRect()
    return {
      marked: player.hasAttribute('data-presenting'),
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      position: getComputedStyle(player).position,
      overflow: document.body.style.overflow,
    }
  })
  check(
    'Escape leaves window presentation and restores its geometry',
    !restored.marked && JSON.stringify(restored) === JSON.stringify({ marked: false, ...beforePresentation }),
    JSON.stringify({ beforePresentation, restored }),
  )
  await page.waitForTimeout(200)
  const restoredCaption = await captionAppearance(h)
  check(
    'Escape restores the caption colours and font size',
    JSON.stringify(restoredCaption) === JSON.stringify(normalCaption),
    JSON.stringify({ normalCaption, restoredCaption }),
  )

  await page.locator(`${PLAYER} segnavia-stage`).focus()
  await page.keyboard.press('f')
  await page.locator(PLAYER).evaluate((player) => player.setAttribute('presentation', 'off'))
  const disabled = await presentationState(h)
  check(
    'changing window presentation to off exits before hiding the control',
    !disabled.presenting && !disabled.marked && disabled.overflow !== 'hidden' && disabled.controlHidden,
    JSON.stringify(disabled),
  )

  await page.locator(PLAYER).evaluate((player) => player.setAttribute('presentation', 'window'))
  await page.locator(`${PLAYER} segnavia-stage`).focus()
  await page.keyboard.press('f')
  await page.locator(PLAYER).evaluate((player) => player.setAttribute('presentation', 'native'))
  const native = await presentationState(h)
  check(
    'changing window presentation to native exits before changing control mode',
    !native.presenting && !native.marked && native.overflow !== 'hidden' && native.controlMode === 'native',
    JSON.stringify(native),
  )
  await page.locator(PLAYER).evaluate((player) => player.removeAttribute('presentation'))
}

async function presentationState(h: Harness) {
  return h.page.locator(PLAYER).evaluate((player: HTMLElement & { controller: { state: { presenting: boolean } } }) => {
    const control = player.shadowRoot?.querySelector('segnavia-fullscreen') as HTMLElement
    return {
      presenting: player.controller.state.presenting,
      marked: player.hasAttribute('data-presenting'),
      overflow: document.body.style.overflow,
      controlHidden: control.hidden,
      controlMode: control.getAttribute('mode'),
    }
  })
}

async function seekToCaptionStates(h: Harness) {
  await h.page.locator(PLAYER).evaluate(async (player: HTMLElement & { controller: { state: { deck: Deck }; seek(ms: number): Promise<void> } }) => {
    const { controller } = player
    const deck = controller.state.deck
    const index = deck.slides.findIndex((slide) => (slide.narration?.words.length ?? 0) > 3)
    const slide = deck.slides[index]
    const word = slide?.narration?.words[2]
    if (!slide?.narration || !word) throw new Error('The continuous deck needs a narrated slide with four words.')
    const startMs = deck.slides.slice(0, index).reduce((total, item) => {
      if (item.narration) return total + (item.beforeMs ?? 0) + item.narration.durationMs + (item.afterMs ?? 0)
      return total + (item.holdMs ?? 0)
    }, 0)
    await controller.seek(startMs + (slide.beforeMs ?? 0) + word.startMs)
  })
  await h.waitFor(PLAYER, (data) => Number(data.word) >= 2)
  await h.page.waitForTimeout(200)
}

async function captionAppearance(h: Harness) {
  return h.page.locator(PLAYER).evaluate((player) => {
    const caption = player.shadowRoot?.querySelector('segnavia-caption') as HTMLElement
    const captionRoot = caption.shadowRoot as ShadowRoot
    const words = {
      spoken: captionRoot.querySelector('.spoken') as HTMLElement,
      current: captionRoot.querySelector('.active') as HTMLElement,
      upcoming: captionRoot.querySelector('span:not(.spoken):not(.active)') as HTMLElement,
    }
    const pixel = (value: string) => {
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      const context = canvas.getContext('2d') as CanvasRenderingContext2D
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = value
      context.fillRect(0, 0, 1, 1)
      return [...context.getImageData(0, 0, 1, 1).data]
    }
    const luminance = (color: number[]) => {
      const [red = 0, green = 0, blue = 0] = color.map((channel) => {
        const value = channel / 255
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue
    }
    const backdrop = pixel(getComputedStyle(player).backgroundColor)
    const appearance = Object.fromEntries(
      Object.entries(words).map(([name, word]) => {
        const style = getComputedStyle(word)
        const rawBackground = pixel(style.backgroundColor)
        const alpha = (rawBackground[3] ?? 0) / 255
        const background = rawBackground.slice(0, 3).map((channel, index) => channel * alpha + (backdrop[index] ?? 0) * (1 - alpha))
        const lighter = Math.max(luminance(pixel(style.color)), luminance(background))
        const darker = Math.min(luminance(pixel(style.color)), luminance(background))
        return [name, { color: style.color, background: style.backgroundColor, contrast: (lighter + 0.05) / (darker + 0.05) }]
      }),
    ) as Record<string, { color: string; background: string; contrast: number }>
    return {
      fontSize: Number.parseFloat(getComputedStyle(caption).fontSize),
      colors: Object.fromEntries(Object.entries(appearance).map(([name, value]) => [name, `${value.color}/${value.background}`])),
      contrast: Object.fromEntries(Object.entries(appearance).map(([name, value]) => [name, value.contrast])),
    }
  })
}
