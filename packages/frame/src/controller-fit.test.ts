import { expect, test } from 'bun:test'
import { Shot } from '@segnavia/format'
import { DeckController } from './controller.ts'

test('a referenced shot carries its fit onto resolved content', async () => {
  const shot = Shot.parse({
    key: 'fit',
    title: 'Fit',
    file: 'shot.png',
    size: { width: 1280, height: 2400 },
    scale: 1,
    annotations: [],
    capturedAt: 'now',
  })
  const realFetch = globalThis.fetch
  globalThis.fetch = (async () => Response.json({ src: 'shot.png', shot })) as unknown as typeof fetch
  try {
    const controller = new DeckController({ hash: null })
    await controller.load(
      { title: 'T', fit: 'cover', frame: true, slides: [{ id: 'a', content: { kind: 'shot-ref', href: 'shot.json', fit: 'focus', frame: false } }] },
      'https://example.com/deck.json',
    )
    expect(controller.state.content).toMatchObject({ kind: 'shot', fit: 'focus', frame: false })
  } finally {
    globalThis.fetch = realFetch
  }
})
