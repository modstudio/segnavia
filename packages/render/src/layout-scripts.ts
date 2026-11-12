import { type LoadedLayoutScript, layoutsUsed, loadLayoutScripts } from '@segnavia/frame/layout'
import { RenderRefusedError } from './errors.ts'

export async function layoutScripts(html: string): Promise<LoadedLayoutScript[]> {
  try {
    return await loadLayoutScripts(html)
  } catch (error) {
    throw new RenderRefusedError(error instanceof Error ? error.message : String(error))
  }
}

export function layoutsForHtml(html: string, scripts: readonly LoadedLayoutScript[]): readonly LoadedLayoutScript[] {
  const names = new Set(layoutsUsed(html))
  return scripts.filter((script) => names.has(script.name))
}
