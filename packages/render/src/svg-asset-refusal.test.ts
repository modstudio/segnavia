import { expect, test } from 'bun:test'
import { markupAssetRefusal } from './browser-tab.ts'

test('refuses a relative SVG image before browser setup', () => {
  expect(markupAssetRefusal('<svg><image href="images/a.png"/></svg>', { scripts: false })).toMatchObject([{ code: 'not-absolute', adviceFor: 'author' }])
})
