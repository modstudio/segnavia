export function navigationError(target: EventTarget & { pause(): void }, playing: boolean, index: number, error: unknown): never {
  if (playing) target.pause()
  target.dispatchEvent(new CustomEvent('error', { detail: { index, message: error instanceof Error ? error.message : String(error) } }))
  throw error
}
