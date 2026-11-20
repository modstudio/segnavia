import { describe, expect, test } from 'bun:test'
import { documentRouteDecision, RENDER_DOCUMENT_URL } from './document-route.ts'

describe('renderer document route', () => {
  test('fulfills only the first main-frame navigation for the exact document URL', () => {
    expect(documentRouteDecision(RENDER_DOCUMENT_URL, true, true, false)).toEqual({ action: 'fulfill' })

    for (const [url, navigation, mainFrame, fulfilled] of [
      [RENDER_DOCUMENT_URL, false, true, false],
      [RENDER_DOCUMENT_URL, true, false, false],
      [RENDER_DOCUMENT_URL, true, true, true],
      [`${RENDER_DOCUMENT_URL}frame`, true, true, false],
    ] as const) {
      expect(documentRouteDecision(url, navigation, mainFrame, fulfilled)).toMatchObject({
        action: 'abort',
        cause: { subject: url, adviceFor: 'author' },
      })
    }
  })

  test('leaves requests to other origins to the asset route', () => {
    expect(documentRouteDecision('https://example.test/image.png', false, false, false)).toEqual({ action: 'asset' })
  })
})
