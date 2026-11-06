import { loadDiagramScript } from '@segnavia/frame/diagrams'
import { RenderRefusedError } from './errors.ts'

type DiagramModule = { diagrams(): Promise<string> }
export type DiagramModuleLoader = () => Promise<DiagramModule>

const importDiagrams: DiagramModuleLoader = () => import('@segnavia/diagrams')

export async function resolveDiagramScript(html: string, load: DiagramModuleLoader = importDiagrams): Promise<string | undefined> {
  try {
    return await loadDiagramScript(html)
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('no diagram provider is registered')) throw error
  }
  try {
    return await (await load()).diagrams()
  } catch {
    throw new RenderRefusedError(
      'This content draws a diagram, but no diagram script is available: install @segnavia/diagrams, or call registerDiagramProvider from @segnavia/frame/diagrams, to clear this refusal.',
    )
  }
}
