import type { WatchedSeed } from './watched-seed.ts'

const watchedByPlayer = new WeakMap<object, WatchedSeed>()

export function definePlayerWatchedPropertyAccessor(prototype: object): void {
  Object.defineProperty(prototype, 'watched', {
    configurable: true,
    get(this: object) {
      return watchedByPlayer.get(this)
    },
    set(this: object, value: WatchedSeed | undefined) {
      if (value === undefined) watchedByPlayer.delete(this)
      else watchedByPlayer.set(this, value)
    },
  })
}

export function takePlayerWatched(player: object): WatchedSeed | undefined {
  const watched = watchedByPlayer.get(player)
  watchedByPlayer.delete(player)
  return watched
}
