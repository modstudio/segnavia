import { z } from 'zod'

export function renderIssuePath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((rendered, part) => {
    if (typeof part === 'number') return `${rendered}[${part}]`
    const name = String(part)
    return rendered.length === 0 ? name : `${rendered}.${name}`
  }, '')
}

type UnknownKeyRemedies = Readonly<Record<string, string>>

function unknownKeyRemedy(keys: readonly string[], remedies: UnknownKeyRemedies): string {
  if (keys.length === 1) return remedies[keys[0] as string] ?? 'remove it'
  if (!keys.some((key) => remedies[key] !== undefined)) return 'remove them'
  return keys
    .map((key) => {
      const remedy = remedies[key]
      return remedy === undefined ? `remove "${key}"` : remedy.replace(' it ', ` "${key}" `)
    })
    .join(' and ')
}

interface UnknownKeyIssue {
  code: string
  keys?: string[]
  path?: PropertyKey[]
}

function unknownKeyMessage(issue: UnknownKeyIssue, remedies: UnknownKeyRemedies): string | undefined {
  if (issue.code !== 'unrecognized_keys' || issue.keys === undefined) return undefined
  const keys = issue.keys
  const issuePath = issue.path ?? []
  const renderedPath = renderIssuePath(issuePath)
  const subject = keys.length === 1 ? `unknown key "${keys[0]}"` : `unknown keys ${keys.map((key) => `"${key}"`).join(', ')}`
  const path = keys.length === 1 ? renderIssuePath([...issuePath, keys[0] as string]) : renderedPath
  const location = path.length === 0 ? '' : `${path}: `
  return `${location}${subject}; the model does not define ${keys.length === 1 ? 'it' : 'them'} here; ${unknownKeyRemedy(keys, remedies)} to clear this refusal`
}

export function closedObject<const Shape extends z.core.$ZodShape>(shape: Shape, remedies: UnknownKeyRemedies = {}): z.ZodObject<Shape> {
  return z.strictObject(shape, { error: (issue) => unknownKeyMessage(issue, remedies) })
}
