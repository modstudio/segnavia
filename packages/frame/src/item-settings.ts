import { ItemSettingsController, type ItemSettingsHandlers } from './item-settings-authoring.ts'
import { ITEM_SETTINGS_TAG, SegnaviaItemSettings } from './item-settings-element.ts'

export { ItemSettingsController, type ItemSettingsErrorDetail, type ItemSettingsHandlers } from './item-settings-authoring.ts'
export { ITEM_SETTINGS_TAG, SegnaviaItemSettings } from './item-settings-element.ts'
export { ENGLISH_ITEM_SETTINGS_LABELS, type ItemSettingsLabels, itemSettingsLabels } from './item-settings-labels.ts'
export type { ItemSettingsSection, ItemSettingsSectionContext } from './item-settings-section.ts'

if (!customElements.get(ITEM_SETTINGS_TAG)) customElements.define(ITEM_SETTINGS_TAG, SegnaviaItemSettings)

export function attachItemSettings(element: SegnaviaItemSettings, handlers: ItemSettingsHandlers): ItemSettingsController {
  const controller = new ItemSettingsController(element, handlers)
  element.connectAuthoring(controller)
  return controller
}
