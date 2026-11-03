export type LeadingHeadingSplit = Readonly<{
  title: string | null
  editable: string
  retained: string
}>

const LEADING_HEADING = /^#(?!#)[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/

/** Splits the first nonblank level-one ATX heading from the editable body. */
export function splitLeadingHeading(markdown: string): LeadingHeadingSplit {
  const lines = markdown.split('\n')
  let index = 0
  while (index < lines.length && lines[index]?.trim() === '') index++
  const line = lines[index]
  const match = line === undefined ? null : LEADING_HEADING.exec(line)
  const title = match?.[1] || null
  if (!title) return { title: null, editable: markdown, retained: '' }
  const heading = lines.slice(0, index + 1).join('\n')
  const retained = markdown[heading.length] === '\n' ? `${heading}\n` : heading
  return { title, editable: markdown.slice(retained.length), retained }
}

/** Joins an editable body to the exact leading-heading source retained by the split. */
export function joinLeadingHeading(editable: string, retained: string): string {
  const separator = retained && editable && !retained.endsWith('\n') ? '\n' : ''
  return `${retained}${separator}${editable}`
}

/** Replaces the retained heading while preserving blank lines before it and its line break. */
export function retainedLeadingHeading(title: string | null, previous: LeadingHeadingSplit): string {
  if (title === null || title === '') return ''
  if (!previous.retained) {
    if (!previous.editable) return `# ${title}`
    return `# ${title}${previous.editable.startsWith('\n') ? '\n' : '\n\n'}`
  }
  const retainedWithoutBreak = previous.retained.endsWith('\n') ? previous.retained.slice(0, -1) : previous.retained
  const headingStart = retainedWithoutBreak.lastIndexOf('\n') + 1
  const leading = retainedWithoutBreak.slice(0, headingStart)
  const lineBreak = previous.retained.endsWith('\n') ? '\n' : ''
  return `${leading}# ${title}${lineBreak}`
}

/** A title field is always one line, including pasted text. */
export function normalizeMarkdownTitle(value: string): string {
  return value.replace(/[\r\n]+/g, ' ')
}
