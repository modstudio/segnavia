export interface ViewerSettings {
  muted: boolean
  captionsVisible: boolean
}

const STORAGE_KEY = 'segnavia:viewer'
export const DEFAULT_VIEWER_SETTINGS: ViewerSettings = { muted: false, captionsVisible: true }

export function readViewerSettings(enabled: boolean): ViewerSettings {
  if (!enabled) return { ...DEFAULT_VIEWER_SETTINGS }
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return { ...DEFAULT_VIEWER_SETTINGS }
    const value = JSON.parse(stored) as Partial<ViewerSettings>
    return {
      muted: typeof value.muted === 'boolean' ? value.muted : false,
      captionsVisible: typeof value.captionsVisible === 'boolean' ? value.captionsVisible : true,
    }
  } catch {
    return { ...DEFAULT_VIEWER_SETTINGS }
  }
}

export function writeViewerSettings(enabled: boolean, settings: ViewerSettings): void {
  if (!enabled) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Storage is an optional convenience; privacy modes and full stores may refuse it.
  }
}
