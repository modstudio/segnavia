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

interface SourceRange {
  start: number
  end: number
}

// Splits source into its comments and everything else, skipping string and
// template literals so a `//` inside one is never read as a comment.
function scan(text: string): { code: string; comments: SourceRange[]; literals: SourceRange[] } {
  let code = ''
  const comments: SourceRange[] = []
  const literals: SourceRange[] = []
  let i = 0
  while (i < text.length) {
    const comment = commentEnd(text, i)
    if (comment !== null) {
      comments.push({ start: i, end: comment })
      i = comment
      continue
    }
    const literal = stringEnd(text, i)
    const end = literal ?? i + 1
    if (literal !== null) literals.push({ start: i, end: Math.min(end, text.length) })
    code += text.slice(i, end)
    i = end
  }
  return { code, comments, literals }
}

export function stripComments(text: string): string {
  return scan(text).code
}

export function comments(text: string): string[] {
  return scan(text).comments.map(({ start, end }) => text.slice(start, end))
}

function blankRanges(text: string, ranges: SourceRange[]): string {
  const blanked = text.split('')
  for (const { start, end } of ranges) {
    for (let i = start; i < end; i += 1) if (blanked[i] !== '\n') blanked[i] = ' '
  }
  return blanked.join('')
}

// The source with each comment blanked to spaces but its line breaks kept, so
// an offset into the result is on the same line as in the source.
export function blankComments(text: string): string {
  return blankRanges(text, scan(text).comments)
}

export function blankCommentsAndLiterals(text: string): string {
  const { comments, literals } = scan(text)
  return blankRanges(text, [...comments, ...literals])
}

export const TEST_FILE = /\.(?:test|spec|test-helper)\.[mc]?[jt]sx?$/

export function isPackageSource(path: string): boolean {
  return /^packages\/[^/]+\/src\//.test(path)
}
