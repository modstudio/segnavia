import type { Harness } from './harness.ts'

const PLAYER = 'segnavia-player'

export async function verifyAuthoredPrintMoment(h: Harness) {
  const { page, check } = h
  await page.evaluate(async () => {
    const player = document.querySelector('segnavia-player') as HTMLElement & { controller: { seek(position: number): Promise<void> } }
    const facts = (window as unknown as { authoringFacts: { deferPrintMoment: boolean } }).authoringFacts
    facts.deferPrintMoment = true
    await player.controller.seek(420)
  })
  await page.locator(`${PLAYER} [data-use-frame]`).click()
  const label = await page.locator(`${PLAYER} [data-authoring-print-moment] output`).textContent()
  await page.evaluate(async () => {
    const bundle = '/segnavia.js'
    const { printDeck } = (await import(bundle)) as { printDeck(deck: unknown, options: unknown): Promise<void> }
    const holder = window as unknown as {
      authoring: { draftDeck(): unknown }
      authoredPrint?: Promise<void>
      releaseAuthoredPrint?: () => void
    }
    holder.authoredPrint = printDeck(holder.authoring.draftDeck(), {
      print: () => new Promise<void>((resolve) => (holder.releaseAuthoredPrint = resolve)),
    })
  })
  await page.waitForFunction(() => typeof (window as unknown as { releaseAuthoredPrint?: unknown }).releaseAuthoredPrint === 'function')
  const frozen = await page
    .frameLocator('body > iframe[style*="-20000px"]')
    .frameLocator('iframe')
    .first()
    .locator('#print-target')
    .evaluate((target) => ({ opacity: getComputedStyle(target).opacity, time: Number(document.getAnimations()[0]?.currentTime) }))
  await page.evaluate(async () => {
    const holder = window as unknown as {
      authoredPrint?: Promise<void>
      releaseAuthoredPrint?: () => void
      authoringFacts: { releasePrintMoment(): void }
    }
    holder.releaseAuthoredPrint?.()
    await holder.authoredPrint
    holder.authoringFacts.releasePrintMoment()
  })
  check(
    'printing draftDeck freezes an animated slide at the frame chosen while its save is pending',
    label === 'Prints at 0.42 s' && frozen.time === 420 && Math.abs(Number(frozen.opacity) - 0.42) < 0.01,
    JSON.stringify({ label, frozen }),
  )
}
