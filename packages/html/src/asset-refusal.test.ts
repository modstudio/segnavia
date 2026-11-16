import { expect, test } from 'bun:test'
import { scriptsOffRefusal, srcsetAssetRefusal } from './asset-refusal.ts'

test('identifies who can act on html-specific refusal advice', () => {
  expect(scriptsOffRefusal('https://scripts.example/a.js').adviceFor).toBe('host')
  const unreadable = srcsetAssetRefusal('bad srcset', undefined, false, {}, () => false)
  expect(unreadable && unreadable.adviceFor).toBe('author')
})
