import { registerLayoutProvider } from '@segnavia/frame/layout'

export const LAYOUT_DEMO_PROVIDER = 'demo-layout'
export const LAYOUT_DEMO_REJECTING_PROVIDER = 'demo-layout-rejecting'

const provider = `segnaviaLayout.define({
  galley(ctx) {
    for (const element of ctx.elements) {
      const node = /** @type {HTMLElement} */ (element)
      node.dataset.galleyRan = ''
      if (node.dataset.layoutPhase === 'galley') node.style.fontSize = '32px'
      if (node.dataset.layoutGeometry !== undefined) {
        const box = document.createElement('i')
        box.dataset.layoutBox = ''
        box.style.cssText = 'position:fixed;inset-inline-start:40px;inset-block-start:52px;inline-size:36px;block-size:24px;background:#d22;z-index:20'
        document.body.append(box)
      }
      if (node.dataset.layoutHebrew !== undefined) {
        const pointed = ctx.ink('בְּרֵאשִׁית')
        const plain = ctx.ink('בראשית')
        node.dataset.layoutMeasurements = JSON.stringify({
          pointed: { x: pointed.x, y: pointed.y, width: pointed.width, height: pointed.height },
          plain: { x: plain.x, y: plain.y, width: plain.width, height: plain.height },
          lineBoxes: ctx.lineBoxes(node).length,
        })
      }
    }
  },
  composed(ctx) {
    for (const element of ctx.elements) {
      const node = /** @type {HTMLElement} */ (element)
      node.dataset.composedRan = ''
      if (node.dataset.layoutPhase === 'composed') {
        node.style.fontSize = '32px'
        const region = document.querySelector('[data-segnavia-region]')
        if (region) {
          region.style.blockSize = '1px'
          region.append(Object.assign(document.createElement('b'), { textContent: 'overflow '.repeat(20) }))
        }
      }
    }
  },
})`

const rejecting = `segnaviaLayout.define({
  galley() { return Promise.reject(new Error('fixture rejection')) },
})`

export function registerLayoutDemoProviders(): void {
  registerLayoutProvider(LAYOUT_DEMO_PROVIDER, { script: async () => provider, priority: 0 })
  registerLayoutProvider(LAYOUT_DEMO_REJECTING_PROVIDER, { script: async () => rejecting, priority: 0 })
}

