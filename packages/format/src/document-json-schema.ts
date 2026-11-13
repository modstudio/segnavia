import { z } from 'zod'
import { DocumentShape, documentStructuralFields } from './document.ts'
import { discriminatedNodeUnion, documentNodeType, type NodeUnionMember } from './document-node-discriminator.ts'
import { UNRESTRICTED_SECTION_FIELDS } from './document-node-refinement.ts'
import { DocumentNodeMembers } from './document-nodes.ts'
import { DOCUMENT_KINDS, DOCUMENT_PROFILES, type DocumentKind } from './document-profile.ts'

type ObjectSchema = z.ZodObject<Record<string, z.ZodType>>

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

function requiredProfileInput(field: string): z.ZodType {
  const input = requiredInput(DocumentShape.shape[field as keyof typeof DocumentShape.shape])
  return field === 'parentPages' && input instanceof z.ZodArray ? input.min(1) : input
}

function selectedNode(member: NodeUnionMember, kind: DocumentKind): ObjectSchema {
  const profile = DOCUMENT_PROFILES[kind]
  const schema = member as ObjectSchema
  const selections: Partial<Record<string, readonly string[]>> = {
    page: profile.pageFields,
    section: [...UNRESTRICTED_SECTION_FIELDS, ...profile.sectionFields],
  }
  const selected = selections[documentNodeType(member)]
  const structural = STRUCTURAL_NODE_FIELDS.filter((field) => field in schema.shape)
  return selected ? pickObject(schema, [...structural, ...selected]) : schema
}

function nodeSchema(kind: DocumentKind): z.ZodType {
  const profile = DOCUMENT_PROFILES[kind]
  let union: z.ZodType
  const children = z.lazy(() => z.array(union))
  const members = DocumentNodeMembers.filter((member) => (profile.children as readonly string[]).includes(documentNodeType(member))).map((member) => {
    const selected = selectedNode(member, kind)
    return 'children' in selected.shape ? selected.extend({ children }) : selected
  }) as unknown as [NodeUnionMember, ...NodeUnionMember[]]
  union = discriminatedNodeUnion(members)
  return union
}

const restrictedRootFields = {
  settings: (profile: (typeof DOCUMENT_PROFILES)[DocumentKind]) => ({ allowed: profile.settings, extra: { dir: z.enum(profile.settingsDir).optional() } }),
  metadata: (profile: (typeof DOCUMENT_PROFILES)[DocumentKind]) => ({ allowed: profile.metadata, extra: {} }),
  style: (profile: (typeof DOCUMENT_PROFILES)[DocumentKind]) => ({ allowed: profile.style, extra: {} }),
} as const

function restrictedObject(field: keyof typeof restrictedRootFields, allowed: readonly string[]): ObjectSchema {
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
  const rootFields = [...documentStructuralFields, ...profile.definitions, ...profile.fields]
  let schema: ObjectSchema = pickObject(DocumentShape, rootFields).extend({ kind: z.literal(kind), children: childArray(kind) })

  for (const field of Object.keys(restrictedRootFields) as Array<keyof typeof restrictedRootFields>) {
    if (!rootFields.includes(field)) continue
    const restriction = restrictedRootFields[field](profile)
    schema = schema.extend({ [field]: restrictedObject(field, restriction.allowed).extend(restriction.extra).optional() })
  }

  const required = profile.required.filter((field) => field !== 'title' && !field.includes('.'))
  const requiredShape = Object.fromEntries(required.map((field) => [field, requiredProfileInput(field)]))
  // Dotted requirements, visible title, childForms and cross-references describe
  // relationships that remain enforced only by Document.parse.
  return schema.extend(requiredShape)
}

const documentSchemas = DOCUMENT_KINDS.map((kind) => documentSchema(kind)) as [ObjectSchema, ...ObjectSchema[]]

export const DocumentJsonSchema = z.discriminatedUnion('kind', documentSchemas)
