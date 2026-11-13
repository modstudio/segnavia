import { z } from 'zod'
import { DocumentShape } from './document.ts'
import { discriminatedNodeUnion } from './document-node-discriminator.ts'
import { DivisionNodeSchema, DocumentNodeMembers, PartNodeSchema, SectionNodeSchema } from './document-nodes.ts'
import { DOCUMENT_PROFILES, type DocumentKind } from './document-profile.ts'

type ObjectSchema = z.ZodObject<Record<string, z.ZodType>>
type DiscriminableSchema = z.core.$ZodTypeDiscriminable

const STRUCTURAL_ROOT_FIELDS = ['type', 'id', 'kind', 'children'] as const
const STRUCTURAL_NODE_FIELDS = ['type', 'id', 'children'] as const

function pickObject(schema: ObjectSchema, fields: readonly string[]): ObjectSchema {
  const mask = Object.fromEntries(fields.map((field) => [field, true])) as Record<string, true>
  const pick = schema.pick as unknown as (held: Record<string, true>) => ObjectSchema
  return pick(mask)
}

function requiredInput(schema: z.ZodType): z.ZodType {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodDefault) return requiredInput(schema.unwrap() as z.ZodType)
  return schema
}

function nodeType(schema: DiscriminableSchema): string {
  const values = [...(schema._zod.propValues?.type ?? [])]
  const value = values.find((candidate): candidate is string => typeof candidate === 'string')
  if (value === undefined) throw new Error('a document node schema needs a literal type')
  return value
}

function nodeSchema(kind: DocumentKind): z.ZodType {
  const profile = DOCUMENT_PROFILES[kind]
  let union: z.ZodType
  const children = z.lazy(() => z.array(union))
  const members = DocumentNodeMembers.filter((member) => (profile.children as readonly string[]).includes(nodeType(member))).map((member) => {
    const type = nodeType(member)
    if (type === 'division') return DivisionNodeSchema.extend({ children })
    if (type === 'part') return PartNodeSchema.extend({ children })
    if (type !== 'section') return member
    return pickObject(SectionNodeSchema, [...STRUCTURAL_NODE_FIELDS, ...profile.sectionFields]).extend({ children })
  }) as unknown as [DiscriminableSchema, ...DiscriminableSchema[]]
  union = discriminatedNodeUnion(members)
  return union
}

function restrictedObject(field: 'settings' | 'metadata' | 'style', allowed: readonly string[]): ObjectSchema {
  const schema = DocumentShape.shape[field].unwrap() as ObjectSchema
  // Zod refuses .pick() on objects carrying refinements, so retain the existing
  // field schemas while rebuilding only this closed profile-selected object.
  const shape = Object.fromEntries(allowed.map((name) => [name, schema.shape[name]])) as Record<string, z.ZodType>
  return z.strictObject(shape)
}

function childArray(kind: DocumentKind): z.ZodArray {
  const count = DOCUMENT_PROFILES[kind].childCount
  let children = z.array(nodeSchema(kind))
  if (count && 'min' in count) children = children.min(count.min)
  if (count && 'exact' in count) children = children.min(count.exact).max(count.exact)
  return children
}

function documentSchema(kind: DocumentKind): ObjectSchema {
  const profile = DOCUMENT_PROFILES[kind]
  const rootFields = [...STRUCTURAL_ROOT_FIELDS, ...profile.definitions, ...profile.fields]
  let schema = pickObject(DocumentShape, rootFields).extend({ kind: z.literal(kind), children: childArray(kind) })

  if ((profile.fields as readonly string[]).includes('settings')) {
    const settings = restrictedObject('settings', profile.settings)
    schema = schema.extend({ settings: settings.extend({ dir: z.enum(profile.settingsDir).optional() }).optional() })
  }
  if ((profile.fields as readonly string[]).includes('metadata'))
    schema = schema.extend({ metadata: restrictedObject('metadata', profile.metadata).optional() })
  if ((profile.fields as readonly string[]).includes('style')) schema = schema.extend({ style: restrictedObject('style', profile.style).optional() })

  const required = profile.required.filter((field) => !field.includes('.'))
  const requiredShape = Object.fromEntries(required.map((field) => [field, requiredInput(DocumentShape.shape[field as keyof typeof DocumentShape.shape])]))
  // Dotted requirements and childForms describe relationships that remain enforced only by Document.parse.
  return schema.extend(requiredShape)
}

const documentSchemas = Object.keys(DOCUMENT_PROFILES).map((kind) => documentSchema(kind as DocumentKind)) as [ObjectSchema, ...ObjectSchema[]]

export const DocumentJsonSchema = z.discriminatedUnion('kind', documentSchemas)
