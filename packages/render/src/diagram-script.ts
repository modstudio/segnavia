import { diagramProvider, hasDiagram } from '@segnavia/frame/diagrams'
import { RenderRefusedError } from './errors.ts'

type DiagramModule = { diagrams(): Promise<string> }
export type DiagramModuleLoader = () => Promise<DiagramModule>

const importDiagrams: DiagramModuleLoader = () => import('@segnavia/diagrams')

export async function resolveDiagramScript(html: string, load: DiagramModuleLoader = importDiagrams): Promise<string | undefined> {
  if (!hasDiagram(html)) return undefined
  const provider = diagramProvider()
  if (provider) return provider()
  let module: DiagramModule
  try {
    module = await load()
  } catch {
    throw new RenderRefusedError(
      'This content draws a diagram, but no diagram script is available: install @segnavia/diagrams, or call registerDiagramProvider from @segnavia/frame/diagrams, to clear this refusal.',
    )
  }
  return module.diagrams()
}
