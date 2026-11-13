import { z } from 'zod'
import { shownValue } from './shown-value.ts'

export type NodeUnionMember = z.core.$ZodTypeDiscriminable
type NodeUnionMembers = readonly [NodeUnionMember, ...NodeUnionMember[]]

export function documentNodeType(member: NodeUnionMember): string {
  const value = [...(member._zod.propValues?.type ?? [])].find((candidate): candidate is string => typeof candidate === 'string')
  if (value === undefined) throw new Error('a document node schema needs a literal type')
  return value
}

function documentNodeTypes(members: readonly NodeUnionMember[]): string[] {
  return members.map(documentNodeType)
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
