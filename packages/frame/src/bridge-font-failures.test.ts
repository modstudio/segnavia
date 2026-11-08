import { expect, test } from 'bun:test'
import { bridgeForHost, MESSAGE, messageFrom } from './bridge.ts'

test('font failure messages trust their frame and reject malformed reports whole', () => {
  const source = {} as Window
  const frame = { contentWindow: source } as HTMLIFrameElement
  const valid = { font: 'body', family: 'Body', weight: 400, style: 'normal', unicodeRange: 'U+0-7F', reason: 'unloaded' as const }
  expect(messageFrom({ source, data: { type: MESSAGE.fontFailures, failures: [valid] } } as MessageEvent, frame)).toEqual({
    type: MESSAGE.fontFailures,
    failures: [valid],
  })
  expect(messageFrom({ source, data: { type: MESSAGE.fontFailures, failures: [valid, { ...valid, reason: 'other' }] } } as MessageEvent, frame)).toBeNull()
  expect(messageFrom({ source, data: { type: MESSAGE.fontFailures, failures: Array.from({ length: 65 }, () => valid) } } as MessageEvent, frame)).toBeNull()
  expect(messageFrom({ source: {} as Window, data: { type: MESSAGE.fontFailures, failures: [valid] } } as MessageEvent, frame)).toBeNull()

  const merged = [...Array.from({ length: 40 }, () => ({ ...valid, reason: 'unsupplied' as const })), ...Array.from({ length: 40 }, () => valid)].slice(0, 64)
  expect(messageFrom({ source, data: { type: MESSAGE.fontFailures, failures: merged } } as MessageEvent, frame)?.failures).toHaveLength(64)
  expect(bridgeForHost({ fontFailures: merged.slice(0, 40) })).toContain('initialFontFailures.concat(failures).slice(0,64)')
})

test('escapes JSON values embedded in the bridge script context', () => {
  const script = bridgeForHost({ fontFailures: [{ font: 'body', family: 'Evil</script>\u2028next\u2029', reason: 'unsupplied' }] })
  expect(script).not.toContain('</script>')
  expect(script).toContain('Evil\\u003c/script>\\u2028next\\u2029')
})

test('supplies the shared font failure bounds to the embedded loader', () => {
  expect(bridgeForHost({ fonts: { body: { faces: [{}] } } })).toContain("familyValue,'data-segnavia-font-failures',64,256")
})

test('messages with non-object data are ignored without throwing', () => {
  const source = {} as Window
  const frame = { contentWindow: source } as HTMLIFrameElement
  for (const data of [null, undefined, 'text', 7]) expect(messageFrom({ source, data } as MessageEvent, frame)).toBeNull()
})
