import type { z } from 'zod'
import { discriminatedNodeUnion } from './document-node-discriminator.ts'
import { DocumentNodeMembers } from './document-nodes.ts'
import { DocumentDefinitionNodeMembers } from './document-nodes-book.ts'

/** Every node shape accepted at a document command input edge. */
export const DocumentNodeInput = discriminatedNodeUnion([...DocumentNodeMembers, ...DocumentDefinitionNodeMembers])
export type DocumentNodeInput = z.input<typeof DocumentNodeInput>
