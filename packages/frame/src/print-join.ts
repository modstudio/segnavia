/** Concatenates print documents in copy order so one dialog prints every fill. */
export function joinPrintDocuments(documents: readonly string[]): string {
  const first = documents[0]
  if (!first) {
    throw new RangeError('There is nothing to print. Pass at least one fill, or omit fills, to clear this refusal.')
  }
  if (documents.length === 1) return first
  const bodies = documents.map((html) => {
    const match = /<body>([\s\S]*)<\/body>/i.exec(html)
    if (!match?.[1]) throw new RangeError('A print document has no body.')
    return match[1]
  })
  return first.replace(/<body>[\s\S]*<\/body>/i, `<body>${bodies.join('')}</body>`)
}
