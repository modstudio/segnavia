import { hasDiagram, registerDiagramProvider } from '@segnavia/frame/diagrams'
import { hasLayoutProvider } from '@segnavia/frame/layout'
import { RenderRefusedError } from './errors.ts'
import { layoutScripts } from './layout-scripts.ts'

type DiagramModule = { diagrams(): Promise<string> }
export type DiagramModuleLoader = () => Promise<DiagramModule>

const importDiagrams: DiagramModuleLoader = () => import('@segnavia/diagrams')

export async function resolveRenderLayoutScripts(html: string, load: DiagramModuleLoader = importDiagrams) {
  if (!hasDiagram(html)) return layoutScripts(html)
  if (hasLayoutProvider('diagram')) return layoutScripts(html)
  let module: DiagramModule
  try {
    module = await load()
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error)
    throw new RenderRefusedError(
      `This content draws a diagram, but no diagram provider is available (${cause}): install @segnavia/diagrams, or call registerDiagramProvider from @segnavia/frame/diagrams, to clear this refusal.`,
    )
  }
  registerDiagramProvider(module.diagrams)
  return layoutScripts(html)
}
