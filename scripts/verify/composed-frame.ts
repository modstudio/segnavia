import type { Frame } from 'playwright-core'
import type { Harness } from './harness.ts'

export async function composedFrame(h: Harness, selector: string, description: string): Promise<Frame> {
  const element = await h.page.$(selector)
  const frame = await element?.contentFrame()
  if (!frame) throw new Error(`${description} did not load.`)
  await frame.waitForFunction(
    () => document.documentElement.hasAttribute('data-segnavia-composed') || document.documentElement.hasAttribute('data-segnavia-compose-failure'),
    undefined,
    { timeout: 20_000 },
  )
  return frame
}
