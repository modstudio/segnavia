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
      const value = typeof issue.input === 'object' && issue.input !== null ? (issue.input as Record<string, unknown>).type : undefined
      return `node type got ${shown(value)}; use one of ${types.map(shown).join(', ')} to clear this refusal`
    },
  })
}
