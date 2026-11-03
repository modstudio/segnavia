/** Lazily loads the complete offline Mermaid renderer and Segnavia drawing adapter. */
export async function diagrams(): Promise<string> {
  return (await import('./script.ts')).diagramScript
}
