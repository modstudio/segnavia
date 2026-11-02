import { expect, test } from 'bun:test'
import {
  equalAlertLabels,
  equalFontReferences,
  equalFonts,
  equalLockedFences,
  normalizeAlertLabels,
  normalizeFontReferences,
  normalizeLockedFences,
} from './markdown-editor-options.ts'

test('normalized rich options compare by value rather than host object identity', () => {
  expect(equalLockedFences(normalizeLockedFences({ MERMAID: 'Diagram' }), normalizeLockedFences({ mermaid: 'Diagram' }))).toBe(true)
  expect(equalAlertLabels(normalizeAlertLabels({ note: 'Note' }), normalizeAlertLabels({ note: 'Note' }))).toBe(true)
  expect(equalFontReferences(normalizeFontReferences([{ app: 'body' }, { app: 'body' }]), normalizeFontReferences([{ app: 'body' }]))).toBe(true)
  const source = { font: async () => undefined }
  expect(equalFonts({ source, local: [] }, { source, local: [] })).toBe(true)
})
