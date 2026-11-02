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
  const retained = lines.slice(0, index + 1).join('\n')
  return { title, editable: markdown.slice(retained.length), retained }
}

/** Joins an editable body to the exact leading-heading source retained by the split. */
export function joinLeadingHeading(editable: string, retained: string): string {
  return `${retained}${editable}`
}

/** Replaces the retained heading while preserving blank lines before it and its line break. */
export function retainedLeadingHeading(title: string | null, previous: LeadingHeadingSplit): string {
  if (title === null || title === '') return ''
  if (!previous.retained) return `# ${title}${previous.editable ? '\n\n' : ''}`
  const separator = previous.editable.startsWith('\n') || previous.editable === '' ? '' : '\n'
  const leading = previous.retained.slice(0, previous.retained.lastIndexOf('\n') + 1)
  return `${leading}# ${title}${separator}`
}

/** A title field is always one line, including pasted text. */
export function normalizeMarkdownTitle(value: string): string {
  return value.replace(/[\r\n]+/g, ' ')
}
