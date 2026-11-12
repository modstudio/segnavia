import { type LoadedLayoutScript, loadLayoutScripts } from '@segnavia/frame/layout'
import { RenderRefusedError } from './errors.ts'

export async function layoutScripts(html: string): Promise<LoadedLayoutScript[]> {
  try {
    return await loadLayoutScripts(html)
  } catch (error) {
    throw new RenderRefusedError(error instanceof Error ? error.message : String(error))
  }
}
