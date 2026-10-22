import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Fill, ImpositionInput, PageInput, SlotDeclarationInput } from '@segnavia/format'
import type { Renderer } from '@segnavia/render'

export const cardSlots: SlotDeclarationInput[] = [
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'role', label: 'Role', type: 'text', placeholder: 'Your role' },
  { key: 'phone', label: 'Phone', type: 'phone' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'logo', label: 'Logo', type: 'image' },
]

const base = 'box-sizing:border-box;margin:0;width:336px;height:192px;padding:24px;background:#fff;color:#17324d;font:16px system-ui'
export const slotCardPages: PageInput[] = [
  {
    id: 'front',
    size: { width: 336, height: 192 },
    slots: cardSlots,
    html: `<!doctype html><html><body style="${base};display:grid;grid-template-columns:1fr 72px;gap:16px;align-items:center"><main><strong data-slot-value="name" style="font-size:26px">Design Name</strong><p data-slot-value="role">Design Role</p></main><img data-slot-src="logo" alt="Logo" style="max-width:72px;max-height:72px"></body></html>`,
  },
  {
    id: 'back',
    size: { width: 336, height: 192 },
    slots: cardSlots,
    html: `<!doctype html><html><body style="${base};display:grid;place-content:center;gap:8px"><span data-slot-value="phone">Design Phone</span><span data-slot-value="email">design@example.com</span></body></html>`,
  },
]

export const firstCardFill: Fill = {
  id: 'mina',
  label: 'Mina Patel',
  values: { name: '<em>Mina Patel</em>', role: 'Designer', phone: '+1 212 555 0101', email: 'mina@example.com', logo: { asset: 'mark' } },
}
export const secondCardFill: Fill = {
  id: 'noah',
  label: 'Noah Kim',
  values: { name: 'Noah Kim', role: 'Engineer', phone: '+1 212 555 0102', email: 'noah@example.com', logo: { asset: 'mark' } },
}
export const slotCardImposition: ImpositionInput = {
  paper: 'business-card-us',
  orientation: 'landscape',
  unit: 'in',
  columns: 1,
  rows: 1,
  cell: { width: 3.5, height: 2 },
  sides: 'two',
}

export const slotLogo =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"%3E%3Crect width="32" height="32" rx="8" fill="%23d27550"/%3E%3C/svg%3E'

export async function buildSlotDemo(site: string): Promise<void> {
  writeFileSync(
    path.join(site, 'slots.html'),
    `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:32px;background:#e7e7e4;font:16px system-ui}.cards{display:flex;flex-wrap:wrap;gap:24px;align-items:start}.card{width:420px}segnavia-document{display:block}segnavia-page{display:block;width:336px}#filled-deck-thumbnail{display:block;inline-size:336px}segnavia-item-settings{display:block;inline-size:22rem;padding:1rem;background:#fff;color:#17324d}segnavia-item-settings input,segnavia-item-settings select,segnavia-item-settings button{font:14px system-ui}</style></head><body><h1>Filled business cards</h1><div class="cards"><segnavia-document id="mina" class="card"></segnavia-document><segnavia-item-settings id="card-settings"></segnavia-item-settings><segnavia-item-settings id="card-settings-rtl" dir="rtl" lang="he"></segnavia-item-settings><segnavia-document id="noah" class="card"></segnavia-document><segnavia-page id="unfilled"></segnavia-page><segnavia-page id="shrink-card"></segnavia-page><segnavia-thumbnail id="filled-thumbnail"></segnavia-thumbnail><segnavia-thumbnail id="filled-deck-thumbnail"></segnavia-thumbnail></div><script type="module" src="segnavia.js"></script><script type="module">
      import { printPages } from './segnavia.js'
      await customElements.whenDefined('segnavia-document')
      const pages = ${JSON.stringify(slotCardPages)}
      const declarations = ${JSON.stringify(cardSlots)}
      const resolveAsset = async ref => ref === 'mark' ? ${JSON.stringify(slotLogo)} : Promise.reject(new Error('missing asset'))
      const reports = []
      const overflowPage = mode => ({
        size: { width: 336, height: 192 },
        slots: [{ key: 'name', label: 'Name', type: 'text', overflow: mode }],
        html: '<div style="${base}"><strong data-slot-value="name" style="display:block;inline-size:100px;block-size:96px;font-size:80px;white-space:nowrap">Design Name</strong></div>',
      })
      const shrink = document.getElementById('shrink-card')
      shrink.slots = { fill: { id: 'long', values: { name: 'Alexandria Montgomery' } }, report: report => reports.push(report) }
      shrink.page = overflowPage('shrink')
      for (const [id, fill] of [['mina', ${JSON.stringify(firstCardFill)}], ['noah', ${JSON.stringify(secondCardFill)}]]) {
        const viewer = document.getElementById(id)
        viewer.slots = { fill, declarations, resolveAsset, report: report => reports.push(report) }
        viewer.load(pages, { paper: 'business-card-us', orientation: 'landscape' })
      }
      const unfilled = document.getElementById('unfilled')
      unfilled.slots = { report: report => reports.push(report) }
      unfilled.page = pages[0]
      const thumbnail = document.getElementById('filled-thumbnail')
      thumbnail.slots = { fill: ${JSON.stringify(firstCardFill)}, resolveAsset }
      thumbnail.print = { paper: 'business-card-us', orientation: 'landscape' }
      thumbnail.page = pages[0]
      const deckThumbnail = document.getElementById('filled-deck-thumbnail')
      deckThumbnail.slots = { fill: ${JSON.stringify(firstCardFill)} }
      deckThumbnail.deck = {
        title: 'Filled slot deck',
        size: { width: 336, height: 192 },
        slots: [{ key: 'name', label: 'Name', type: 'text' }],
        slides: [{ id: 'card', content: { kind: 'html', html: '<p data-slot-value="name">Design Name</p>' } }],
      }
      let failedAsset
      const failing = { fill: { id: 'broken', values: { logo: { asset: 'missing' } } }, resolveAsset, report: report => { failedAsset = report } }
      const probe = document.createElement('segnavia-page')
      probe.slots = failing
      probe.page = pages[0]
      document.body.append(probe)
      await printPages(pages, ${JSON.stringify(slotCardImposition)}, {
        slots: { declarations, fill: ${JSON.stringify(secondCardFill)}, resolveAsset },
        print: async win => {
          await new Promise(resolve => setTimeout(resolve, 50))
          window.slotPrintFacts = [...win.document.querySelectorAll('iframe')].map(frame => frame.getAttribute('srcdoc') ?? '').join('|')
        },
      })
      await printPages([overflowPage('shrink')], ${JSON.stringify(slotCardImposition)}, {
        slots: {
          fill: { id: 'long-print', values: { name: 'Alexandria Montgomery' } },
          report: report => reports.push(report),
        },
        print: () => {},
      })
      let refuseError
      try {
        await printPages([overflowPage('refuse')], ${JSON.stringify(slotCardImposition)}, {
          slots: { fill: { id: 'long', values: { name: 'Alexandria Montgomery' } } },
          print: () => { throw new Error('overflowed refuse slot reached print') },
        })
      } catch (error) {
        refuseError = error?.name === 'RequiredSlotsRefusedError' ? error.message : String(error)
      }
      await new Promise(resolve => {
        const deadline = performance.now() + 2000
        const settled = () => reports.some(report => report.fill === 'long-print' && report.slots.name !== 'filled') || performance.now() >= deadline
        const check = () => settled() ? resolve() : setTimeout(check, 10)
        check()
      })
      window.slotFacts = { reports, refuseError, get failedAsset() { return failedAsset } }
      window.slotCard = { declarations, fills: { mina: ${JSON.stringify(firstCardFill)}, noah: ${JSON.stringify(secondCardFill)} }, resolveAsset }
      window.dispatchEvent(new Event('slot-card-ready'))
    </script><script type="module" src="slot-settings-demo.js"></script></body></html>`,
  )
  const root = path.resolve(import.meta.dirname, '..')
  const built = await Bun.build({
    entrypoints: [path.join(root, 'fixtures', 'slot-settings-demo.ts')],
    target: 'browser',
    format: 'esm',
    minify: true,
  })
  if (!built.success || !built.outputs[0]) throw new Error(`Could not build slot settings demo: ${built.logs.join('\n')}`)
  await Bun.write(path.join(site, 'slot-settings-demo.js'), built.outputs[0])
}

export async function buildSlotPdf(renderer: Renderer, output: string): Promise<void> {
  writeFileSync(
    path.join(output, 'slots-card.pdf'),
    await renderer.pagesPdf(slotCardPages, {
      imposition: slotCardImposition,
      slots: { fill: firstCardFill, resolveAsset: async () => slotLogo },
    }),
  )
}
