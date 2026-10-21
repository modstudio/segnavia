import { slotFitMessageData } from '@segnavia/frame/bridge'
import { type PreparedSlots, requiredSlotRefusal, unmeasuredSlotRefusal } from '@segnavia/html'
import type { BrowserContext, Page } from 'playwright-core'

export async function installSlotFitCapture(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    if (window !== window.top) return
    const target = window as typeof window & { __segnaviaSlotFit?: unknown[] }
    target.__segnaviaSlotFit = []
    window.addEventListener('message', (event) => target.__segnaviaSlotFit?.push(event.data))
  })
}

export async function mergeCapturedSlotFit(tab: Page, slots: PreparedSlots, timeout: number): Promise<void> {
  await tab
    .waitForFunction(
      () => {
        const messages = (window as typeof window & { __segnaviaSlotFit?: Array<{ type?: unknown }> }).__segnaviaSlotFit ?? []
        const expected = document.querySelector('[data-slot-overflow]') ? 1 : document.querySelectorAll('iframe[srcdoc]').length
        return messages.filter((message) => message?.type === 'segnavia:slot-fit').length >= expected
      },
      undefined,
      { timeout },
    )
    .catch(() => {})
  const messages = await tab.evaluate(() => (window as typeof window & { __segnaviaSlotFit?: unknown[] }).__segnaviaSlotFit ?? [])
  const measured = new Map<string, number>()
  for (const data of messages) {
    const fit = slotFitMessageData(data)
    if (fit) {
      for (const key of Object.keys(fit.slots)) measured.set(key, (measured.get(key) ?? 0) + 1)
      slots.mergeFit(fit.slots)
    }
  }
  const refusal = requiredSlotRefusal(slots.declarations, slots.report)
  if (refusal) throw refusal
  const measurementRefusal = unmeasuredSlotRefusal(slots.declarations, slots.report, slots.marked, measured)
  if (measurementRefusal) throw measurementRefusal
}
