import type { Fill, SlotDeclaration, SlotReport, TextDirection } from '@segnavia/format'
import type { ItemSettingsLabels } from './item-settings-labels.ts'

export interface ItemSettingsSectionContext {
  declarations: readonly SlotDeclaration[]
  fills: readonly Fill[]
  fill: string | null
  source: Fill | undefined
  report: SlotReport | undefined
  labels: ItemSettingsLabels
  dir: TextDirection
}

export interface ItemSettingsSection {
  id: string
  label: string
  render(container: HTMLElement, context: ItemSettingsSectionContext): void
}
