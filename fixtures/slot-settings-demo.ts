import type { Fill, SlotDeclaration, SlotsOptions } from '@segnavia/format'
import type { SegnaviaDocument } from '@segnavia/frame'
import type { SegnaviaItemSettings } from '@segnavia/frame/item-settings'
import { attachItemSettings } from '@segnavia/frame/item-settings'

interface SlotCard {
  declarations: SlotDeclaration[]
  fills: { mina: Fill; noah: Fill }
  resolveAsset: NonNullable<SlotsOptions['resolveAsset']>
}

const card = (window as unknown as { slotCard: SlotCard }).slotCard
const mina = document.querySelector<SegnaviaDocument & { slots: SlotsOptions }>('#mina')
const settings = document.querySelector<SegnaviaItemSettings>('#card-settings')
const rtl = document.querySelector<SegnaviaItemSettings>('#card-settings-rtl')
if (!card || !mina || !settings || !rtl) throw new Error('Slot settings demo is missing its card or settings element.')

const source: Fill = { id: 'directory', label: 'Directory', values: { name: 'Directory Name' } }
const minaHand: Fill = { ...card.fills.mina, values: { ...card.fills.mina.values } }
delete minaHand.values.name
let fills: Fill[] = [minaHand, { ...card.fills.noah, values: { ...card.fills.noah.values } }]
const saves: Fill[] = []
const viewer = mina
const panel = settings
const rtlPanel = rtl
const cardData = card

function applyCard(fillId: string) {
  const fill = fills.find((item) => item.id === fillId) ?? fills[0]
  if (!fill) return
  viewer.slots = {
    ...viewer.slots,
    fill,
    source,
    declarations: cardData.declarations,
    resolveAsset: cardData.resolveAsset,
    report: (report) => {
      panel.report = report
    },
  }
}

panel.declarations = cardData.declarations
panel.fills = fills
panel.fill = minaHand.id
panel.source = source
rtlPanel.declarations = cardData.declarations
rtlPanel.fills = fills
rtlPanel.fill = minaHand.id
rtlPanel.source = source
rtlPanel.dir = 'rtl'
rtlPanel.lang = 'he'

panel.addEventListener('segnavia-fill-select', (event) => {
  const id = (event as CustomEvent<string>).detail
  panel.fill = id
  applyCard(id)
})

const authoring = attachItemSettings(panel, {
  createFill: async ({ label }) => {
    const fill: Fill = { id: `host-${crypto.randomUUID()}`, label, values: {} }
    fills = [...fills, fill]
    return fill
  },
  saveFill: async (fill) => {
    saves.push(fill)
    fills = fills.map((item) => (item.id === fill.id ? fill : item))
    if (panel.fill === fill.id) applyCard(fill.id)
  },
  deleteFill: async (id) => {
    fills = fills.filter((item) => item.id !== id)
  },
  pickAsset: async () => ({ asset: 'mark' }),
})

;(window as unknown as { itemSettings: SegnaviaItemSettings; itemSettingsAuthoring: typeof authoring; itemSettingsFacts: { saves: Fill[] } }).itemSettings =
  panel
;(window as unknown as { itemSettingsAuthoring: typeof authoring }).itemSettingsAuthoring = authoring
;(window as unknown as { itemSettingsFacts: { saves: Fill[] } }).itemSettingsFacts = { saves }
