import { expect, test } from 'bun:test'
import { expandLogoMotifs } from '@segnavia/html'
import { assetRouteDecision, markupAssetRefusal } from './browser-tab.ts'

test('a remote logo uses the ordinary approved image asset route', async () => {
  const url = 'https://images.example/logo.svg'
  const html = expandLogoMotifs('<header data-motif="segnavia:logo"></header>', { src: url, alt: 'House' })
  expect(markupAssetRefusal(html, { scripts: false })).toMatchObject([{ code: 'unapproved-origin', subject: url }])
  let requested = ''
  const answer = { body: new Uint8Array([1, 2, 3]), contentType: 'image/svg+xml' }
  expect(
    await assetRouteDecision(
      url,
      'image',
      [{ origin: 'https://images.example', kinds: ['image'] }],
      async (request) => {
        requested = request
        return answer
      },
      new AbortController().signal,
    ),
  ).toEqual({ action: 'fulfill', ...answer })
  expect(requested).toBe(url)
})
