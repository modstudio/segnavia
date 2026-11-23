import { hasWindow } from './schedule.ts'

export class ControllerWindowConnection {
  private connected = false

  connect(hash: string | null | undefined, keys: 'stage' | 'page' | undefined, onHash: () => void, onPageKey: (event: KeyboardEvent) => void): void {
    if (!hasWindow || this.connected) return
    if (hash) window.addEventListener('hashchange', onHash)
    if (keys === 'page') window.addEventListener('keydown', onPageKey)
    this.connected = true
  }

  disconnect(onHash: () => void, onPageKey: (event: KeyboardEvent) => void): void {
    if (!hasWindow || !this.connected) return
    window.removeEventListener('hashchange', onHash)
    window.removeEventListener('keydown', onPageKey)
    this.connected = false
  }
}
