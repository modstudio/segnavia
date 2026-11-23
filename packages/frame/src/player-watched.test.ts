import { expect, test } from 'bun:test'
import type { DeckLoadOptions, WatchedSeed } from './watched-seed.ts'

const HTMLElementBase = globalThis.HTMLElement ?? class {}
const previousHTMLElement = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement')
Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: HTMLElementBase })

const { SegnaviaPlayer } = await import('./player.ts')
if (previousHTMLElement) Object.defineProperty(globalThis, 'HTMLElement', previousHTMLElement)
else Reflect.deleteProperty(globalThis, 'HTMLElement')

test('the player gives watched to the next src load and then clears it', async () => {
  const loads: Array<{ src: string; options: DeckLoadOptions | undefined }> = []
  const player = Object.create(SegnaviaPlayer.prototype) as InstanceType<typeof SegnaviaPlayer>
  Reflect.set(player, 'controller', {
    setPlayerOptions() {},
    loadUrl(src: string, options: DeckLoadOptions | undefined) {
      loads.push({ src, options })
      return Promise.resolve()
    },
  })
  Reflect.set(player, 'getAttribute', () => null)
  const watched: WatchedSeed = [{ slideId: 'one', reached: true, watchedThrough: true }]

  player.watched = watched
  player.attributeChangedCallback('src', null, '/first.json')
  player.attributeChangedCallback('src', '/first.json', '/second.json')
  await Promise.resolve()

  expect(loads).toEqual([
    { src: '/first.json', options: { watched } },
    { src: '/second.json', options: undefined },
  ])
  expect(player.watched).toBeUndefined()
})
