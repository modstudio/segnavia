import { expect, test } from 'bun:test'
import { ENGLISH_ITEM_SETTINGS_LABELS, itemSettingsLabels } from './item-settings-labels.ts'

test('partial item settings labels fall back to English', () => {
  const labels = itemSettingsLabels({ fields: 'שדות', override: 'דריסה' })
  expect(labels.fields).toBe('שדות')
  expect(labels.override).toBe('דריסה')
  expect(labels.useSource).toBe(ENGLISH_ITEM_SETTINGS_LABELS.useSource)
  expect(labels.missing).toBe(ENGLISH_ITEM_SETTINGS_LABELS.missing)
})
