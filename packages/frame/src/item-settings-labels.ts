export interface ItemSettingsLabels {
  fields: string
  fills: string
  fillName: string
  addFill: string
  removeFill: string
  newFill: string
  override: string
  useSource: string
  chooseAsset: string
  required: string
  missing: string
  overflowed: string
  shrunk: string
}

export const ENGLISH_ITEM_SETTINGS_LABELS: ItemSettingsLabels = {
  fields: 'Fields',
  fills: 'Fill',
  fillName: 'Fill name',
  addFill: 'Add fill',
  removeFill: 'Remove fill',
  newFill: 'New fill',
  override: 'Override',
  useSource: 'Use source',
  chooseAsset: 'Choose asset',
  required: 'Required',
  missing: 'This required field is not filled.',
  overflowed: 'This value overflowed its slot.',
  shrunk: 'This value was shrunk to fit.',
}

export function itemSettingsLabels(labels: Partial<ItemSettingsLabels> = {}): ItemSettingsLabels {
  return { ...ENGLISH_ITEM_SETTINGS_LABELS, ...labels }
}
