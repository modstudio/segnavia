import { expect, test } from 'bun:test'
import { composerScript } from './composer.ts'

test('embeds line-label policy and fill only when a line-keyed series is configured', () => {
  const ordinary = composerScript('{}')
  const lineKeyed = composerScript('{"lineNoteSeries":[{"name":"apparatus","system":"arabic"}]}')
  expect(ordinary).not.toContain('var lineKeyedLabels=')
  expect(ordinary).not.toContain('function applyLineLabels')
  expect(lineKeyed).toContain('var lineKeyedLabels=')
  expect(lineKeyed).toContain('function applyLineLabels')
  expect(lineKeyed).toContain('line-keyed note labels for ')
})
