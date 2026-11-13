import { z } from 'zod'
import { shownValue } from './shown-value.ts'

type NodeUnionMembers = readonly [z.core.$ZodTypeDiscriminable, ...z.core.$ZodTypeDiscriminable[]]

function documentNodeTypes(members: readonly z.core.$ZodTypeDiscriminable[]): string[] {
  return members.flatMap((member) => [...(member._zod.propValues?.type ?? [])]).filter((value): value is string => typeof value === 'string')
}

export function discriminatedNodeUnion<const Members extends NodeUnionMembers>(members: Members): z.ZodDiscriminatedUnion<Members, 'type'> {
  const types = documentNodeTypes(members)
  return z.discriminatedUnion('type', members, {
    error: (issue) => {
      const accepted = types.map(shownValue).join(', ')
      if (typeof issue.input !== 'object' || issue.input === null || Array.isArray(issue.input)) {
        return `node got ${shownValue(issue.input)}; a node is an object whose type is one of ${accepted}`
      }
      const value = (issue.input as Record<string, unknown>).type
      return `node type got ${shownValue(value)}; use one of ${accepted} to clear this refusal`
    },
  })
}
