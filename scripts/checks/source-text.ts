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

function commentAndLiteralRanges(text: string): SourceRange[] {
  const ranges: SourceRange[] = []

  function scanBlankedToken(i: number): number | null {
    const comment = commentEnd(text, i)
    if (comment !== null) {
      ranges.push({ start: i, end: comment })
      return comment
    }
    if (text[i] === "'" || text[i] === '"') {
      const end = Math.min(stringEnd(text, i) ?? text.length, text.length)
      ranges.push({ start: i, end })
      return end
    }
    if (text[i] === '`') return scanTemplate(i)
    return null
  }

  function scanCode(start: number, inTemplateSubstitution = false): number {
    let braces = inTemplateSubstitution ? 1 : 0
    let i = start
    while (i < text.length) {
      const tokenEnd = scanBlankedToken(i)
      if (tokenEnd !== null) {
        i = tokenEnd
        continue
      }
      if (!inTemplateSubstitution) {
        i += 1
        continue
      }
      if (text[i] === '{') braces += 1
      if (text[i] === '}' && --braces === 0) return i + 1
      i += 1
    }
    return i
  }

  function scanTemplate(start: number): number {
    let literalStart = start
    let i = start + 1
    while (i < text.length) {
      if (text[i] === '\\') {
        i += 2
        continue
      }
      if (text[i] === '`') {
        ranges.push({ start: literalStart, end: i + 1 })
        return i + 1
      }
      if (text[i] === '$' && text[i + 1] === '{') {
        ranges.push({ start: literalStart, end: i + 2 })
        const substitutionEnd = scanCode(i + 2, true)
        literalStart = Math.max(i + 2, substitutionEnd - 1)
        i = substitutionEnd
        continue
      }
      i += 1
    }
    ranges.push({ start: literalStart, end: text.length })
    return text.length
  }

  scanCode(0)
  return ranges
}

export function blankCommentsAndLiterals(text: string): string {
  return blankRanges(text, commentAndLiteralRanges(text))
}

export const TEST_FILE = /\.(?:test|spec|test-helper)\.[mc]?[jt]sx?$/

export function isPackageSource(path: string): boolean {
  return /^packages\/[^/]+\/src\//.test(path)
}
