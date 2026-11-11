// Where the token starting at `i` ends, for a comment or a string literal.
function commentEnd(text: string, i: number): number | null {
  if (text.startsWith('//', i)) {
    const end = text.indexOf('\n', i)
    return end === -1 ? text.length : end
  }
  if (text.startsWith('/*', i)) {
    const end = text.indexOf('*/', i + 2)
    return end === -1 ? text.length : end + 2
  }
  return null
}

function stringEnd(text: string, i: number): number | null {
  const quote = text[i]
  if (quote !== "'" && quote !== '"' && quote !== '`') return null
  let j = i + 1
  while (j < text.length && text[j] !== quote) j += text[j] === '\\' ? 2 : 1
  return j + 1
}

// Splits source into its comments and everything else, skipping string and
// template literals so a `//` inside one is never read as a comment.
function scan(text: string): { code: string; comments: string[] } {
  let code = ''
  const found: string[] = []
  let i = 0
  while (i < text.length) {
    const comment = commentEnd(text, i)
    if (comment !== null) {
      found.push(text.slice(i, comment))
      i = comment
      continue
    }
    const end = stringEnd(text, i) ?? i + 1
    code += text.slice(i, end)
    i = end
  }
  return { code, comments: found }
}

export function stripComments(text: string): string {
  return scan(text).code
}

export function comments(text: string): string[] {
  return scan(text).comments
}

// The source with each comment blanked to spaces but its line breaks kept, so
// an offset into the result is on the same line as in the source.
export function blankComments(text: string): string {
  let blanked = text
  let from = 0
  for (const comment of comments(text)) {
    const at = blanked.indexOf(comment, from)
    blanked = blanked.slice(0, at) + comment.replace(/[^\n]/g, ' ') + blanked.slice(at + comment.length)
    from = at + comment.length
  }
  return blanked
}
