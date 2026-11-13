export function composerConfigFromDocument(html: string): Record<string, unknown> {
  const json = html.match(/var config=(\{[\s\S]*?\});\s*var preflightEntries=/)?.[1]
  if (!json) throw new Error('the document has no composer config')
  return JSON.parse(json) as Record<string, unknown>
}
