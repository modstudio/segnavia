import type { Locator, Page } from 'playwright-core'
import { BOUNDED_WAIT_MS } from './harness.ts'

export async function waitChanges(page: Page, count: number) {
  await page.waitForFunction((n) => ((window as unknown as { boardChanges?: unknown[] }).boardChanges?.length ?? 0) >= n, count, {
    timeout: BOUNDED_WAIT_MS,
  })
}

export async function center(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('The board editing target has no box.')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

export async function settledBoxes(locators: readonly Locator[], timeout: number) {
  const deadline = Date.now() + timeout
  let boxes = await Promise.all(locators.map((locator) => locator.boundingBox()))
  while (boxes.some((box) => !box) && Date.now() < deadline) {
    await locators[0]?.page().waitForTimeout(50)
    boxes = await Promise.all(locators.map((locator) => locator.boundingBox()))
  }
  return boxes
}

export async function drag(page: Page, from: { x: number; y: number }, x: number, y: number) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + x, from.y + y, { steps: 4 })
  await page.mouse.up()
}
