import { expect, test } from 'bun:test'
import { Deck } from '@segnavia/format'
import { resolveFreshContent } from './controller-resolution.ts'

test('a hosted url slide with cues requires a bridged resolution', async () => {
  const slide = Deck.parse({
    title: 'T',
    slides: [
      {
        id: 'served',
        content: { kind: 'url', src: 'served.html', annotationCount: 1 },
        narration: {
          text: 'choose it',
          words: [
            { text: 'choose', startMs: 0, endMs: 100 },
            { text: 'it', startMs: 100, endMs: 200 },
          ],
          durationMs: 200,
          audio: null,
          live: false,
          cues: [{ word: 0, annotation: 0 }],
        },
      },
    ],
  }).slides[0]
  if (!slide) throw new Error('The test slide did not parse.')
  const resolve = (bridge: boolean) =>
    resolveFreshContent(
      slide,
      0,
      () => ({ kind: 'url', src: 'served.html', ...(bridge ? { bridge: true as const } : {}) }),
      (path) => path,
      new Map(),
      undefined,
      1280,
      new AbortController().signal,
    )
  await expect(resolve(false)).rejects.toThrow('Resolve it with bridge: true')
  await expect(resolve(true)).resolves.toMatchObject({ bridge: true })
})
