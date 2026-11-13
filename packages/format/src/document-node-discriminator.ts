import { z } from 'zod'

type NodeUnionMembers = readonly [z.core.$ZodTypeDiscriminable, ...z.core.$ZodTypeDiscriminable[]]

function shown(value: unknown): string {
  if (value === undefined) return 'undefined'
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

export function documentNodeTypes(members: readonly z.core.$ZodTypeDiscriminable[]): string[] {
  return members.flatMap((member) => [...(member._zod.propValues?.type ?? [])]).filter((value): value is string => typeof value === 'string')
}

export function discriminatedNodeUnion<const Members extends NodeUnionMembers>(members: Members): z.ZodDiscriminatedUnion<Members, 'type'> {
  const types = documentNodeTypes(members)
  return z.discriminatedUnion('type', members, {
    error: (issue) => {
      const accepted = types.map(shown).join(', ')
      if (typeof issue.input !== 'object' || issue.input === null || Array.isArray(issue.input)) {
        return `node got ${shown(issue.input)}; a node is an object whose type is one of ${accepted}`
      }
      const value = (issue.input as Record<string, unknown>).type
      return `node type got ${shown(value)}; use one of ${accepted} to clear this refusal`
    },
  })
}
