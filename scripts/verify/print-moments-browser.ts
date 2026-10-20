import type { Harness } from './harness.ts'

export async function verifyLatePrintMoment(h: Harness) {
  const { page, check } = h
  const printing = page.evaluate(async () => {
    const bundle = '/segnavia.js'
    const { printDeck } = (await import(bundle)) as { printDeck: (deck: unknown, options: unknown) => Promise<void> }
    await printDeck(
      {
        title: 'Late print moment',
        scripts: 'sandboxed',
        size: { width: 400, height: 200 },
        slides: [
          {
            id: 'late',
            printAtMs: 500,
            content: {
              kind: 'html',
              html: `<style>@keyframes fade{from{opacity:0}to{opacity:1}}.animated{animation:fade 1s linear both}</style><div id="target">Animated</div><script>
window.addEventListener('segnavia:print',function(event){
  event.detail.waitUntil(new Promise(function(resolve){setTimeout(function(){document.getElementById('target').className='animated';resolve();},50);}));
});
</script>`,
            },
          },
        ],
      },
      {
        print: async () => {
          await new Promise<void>((resolve) => {
            const state = window as Window & { releaseLatePrintMoment?: () => void }
            state.releaseLatePrintMoment = resolve
          })
        },
      },
    )
  })
  await page.waitForFunction(() => typeof (window as Window & { releaseLatePrintMoment?: unknown }).releaseLatePrintMoment === 'function')
  const fact = await page
    .frameLocator('body > iframe[style*="-20000px"]')
    .frameLocator('iframe')
    .locator('#target')
    .evaluate((target) => ({ opacity: getComputedStyle(target).opacity, time: Number(document.getAnimations()[0]?.currentTime) }))
  await page.evaluate(() => (window as Window & { releaseLatePrintMoment?: () => void }).releaseLatePrintMoment?.())
  await printing
  check(
    'a sandboxed CSS animation that starts after load freezes before print readiness',
    Math.abs(Number(fact.opacity) - 0.5) < 0.01 && fact.time === 500,
    JSON.stringify(fact),
  )
}
