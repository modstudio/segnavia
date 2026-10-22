export type ItemSettingsOpenDetail = { slideId: string } | { pageId: string }

export function itemSettingsOpenEvent(detail: ItemSettingsOpenDetail): CustomEvent<ItemSettingsOpenDetail> {
  return new CustomEvent<ItemSettingsOpenDetail>('segnavia-item-settings-open', { detail, bubbles: true, composed: true })
}
