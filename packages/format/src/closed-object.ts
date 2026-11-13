import { z } from 'zod'

export function renderIssuePath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((rendered, part) => {
    if (typeof part === 'number') return `${rendered}[${part}]`
    const name = String(part)
    return rendered.length === 0 ? name : `${rendered}.${name}`
  }, '')
}

function unknownKeyRemedy(path: readonly PropertyKey[], keys: readonly string[]): string {
  const parentPageMargin = keys.length === 1 && keys[0] === 'margin' && path.some((part) => part === 'parentPages')
  return parentPageMargin ? 'move it to geometry.margin' : `remove ${keys.length === 1 ? 'it' : 'them'}`
}

interface UnknownKeyIssue {
  code: string
  keys?: string[]
  path?: PropertyKey[]
}

function unknownKeyMessage(issue: UnknownKeyIssue): string | undefined {
  if (issue.code !== 'unrecognized_keys' || issue.keys === undefined) return undefined
  const keys = issue.keys
  const issuePath = issue.path ?? []
  const renderedPath = renderIssuePath(issuePath)
  const subject = keys.length === 1 ? `unknown key "${keys[0]}"` : `unknown keys ${keys.map((key) => `"${key}"`).join(', ')}`
  const path = keys.length === 1 ? renderIssuePath([...issuePath, keys[0] as string]) : renderedPath
  const location = path.length === 0 ? '' : `${path}: `
  return `${location}${subject}; the model does not define ${keys.length === 1 ? 'it' : 'them'} here; ${unknownKeyRemedy(issuePath, keys)} to clear this refusal`
}

export function closedObject<const Shape extends z.core.$ZodShape>(shape: Shape): z.ZodObject<Shape> {
  return z.strictObject(shape, { error: (issue) => unknownKeyMessage(issue) })
}
