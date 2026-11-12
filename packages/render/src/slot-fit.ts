import { isMeasuredSlotFit } from '@segnavia/format'
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

export async function mergeCapturedSlotFit(tab: Page, slots: PreparedSlots, timeout: number): Promise<Record<string, string>[] | undefined> {
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
  const declared = new Set(slots.declarations.map((slot) => slot.key))
  const measured = new Map<string, number>()
  const captured: Record<string, string>[] = []
  for (const data of messages) {
    const fit = slotFitMessageData(data)
    if (fit) {
      captured.push(Object.fromEntries(Object.entries(fit.slots).filter(([key]) => declared.has(key))))
      for (const [key, state] of Object.entries(fit.slots)) {
        if (isMeasuredSlotFit(state)) measured.set(key, (measured.get(key) ?? 0) + 1)
      }
      slots.mergeFit(fit.slots)
    }
  }
  const refusal = requiredSlotRefusal(slots.declarations, slots.report)
  if (refusal) throw refusal
  const measurementRefusal = unmeasuredSlotRefusal(slots.declarations, slots.report, slots.marked, measured)
  if (measurementRefusal) throw measurementRefusal
  return captured.length === 0 ? undefined : captured
}
