import type { z } from 'zod'
import { collectRecords, type DocumentNode, type DocumentNodePath } from './document-nodes.ts'
import type { TemplateNode } from './document-nodes-book.ts'
import type { Slots } from './slots.ts'

export function refineRecords(
  document: { kind: string; mode?: string; children: DocumentNode[]; templates: TemplateNode[]; data?: { slots?: Slots } },
  ctx: z.RefinementCtx,
): void {
  const templates = new Map(document.templates.map((template) => [template.name, template]))
  const hostSlots = new Set(document.data?.slots?.map((slot) => slot.key) ?? [])
  for (const { node: record, path } of collectRecords(document.children)) {
    refineRecord(document, record, path, record.template === undefined ? undefined : templates.get(record.template), hostSlots, ctx)
  }
}

function recordBodyMarkerCount(html: string): number {
  return [...html.matchAll(/<[a-z][^>]*\sdata-record-body(?:\s|=|\/?>)/gi)].length
}

function refineRecord(
  document: Parameters<typeof refineRecords>[0],
  record: Extract<DocumentNode, { type: 'record' }>,
  path: DocumentNodePath,
  template: TemplateNode | undefined,
  hostSlots: ReadonlySet<string>,
  ctx: z.RefinementCtx,
): void {
  const recordName = record.id ?? path.join('.')
  const hasBody = refineRecordShape(record, recordName, path, ctx)
  if (record.template !== undefined && !template)
    ctx.addIssue({
      code: 'custom',
      path: [...path, 'template'],
      message: `record template ${JSON.stringify(record.template)} is not defined; define template ${JSON.stringify(record.template)} to clear this refusal`,
    })
  refineRecordBody(template, hasBody, recordName, path, ctx)
  if (!template) {
    refineContinuousRecord(document, recordName, path, ctx)
    return
  }
  refineRecordTemplate(document, record, recordName, path, template, hostSlots, ctx)
  refineContinuousRecord(document, recordName, path, ctx)
}

function refineRecordShape(record: Extract<DocumentNode, { type: 'record' }>, recordName: string, path: DocumentNodePath, ctx: z.RefinementCtx): boolean {
  const children = 'children' in record ? record.children : undefined
  const body = children?.[0]
  const hasBody = children?.length === 1 && body?.type === 'flow'
  if (children !== undefined && (children.length !== 1 || body?.type !== 'flow')) {
    ctx.addIssue({
      code: 'custom',
      path: [...path, 'children'],
      message: `record ${recordName} needs exactly one flow child; replace its children with one flow child to clear this refusal`,
    })
  }
  if (record.template === undefined && !hasBody) {
    ctx.addIssue({
      code: 'custom',
      path,
      message: `record ${recordName} has neither a template nor a flow; provide a template or one flow child to clear this refusal`,
    })
  }
  if (record.template === undefined && Object.keys(record.values ?? {}).length > 0) {
    ctx.addIssue({
      code: 'custom',
      path: [...path, 'values'],
      message: `record ${recordName} has values but no template to declare them; provide a template or remove the values to clear this refusal`,
    })
  }
  return hasBody
}

function refineRecordBody(template: TemplateNode | undefined, hasBody: boolean, recordName: string, path: DocumentNodePath, ctx: z.RefinementCtx): void {
  if (!template || !hasBody) return
  const markers = recordBodyMarkerCount(template.html)
  if (markers !== 1)
    ctx.addIssue({
      code: 'custom',
      path: [...path, 'children'],
      message: `record ${recordName} has a flow, but template ${template.name} has ${markers === 0 ? 'no' : markers} data-record-body ${markers === 1 ? 'element' : 'elements'}; add exactly one data-record-body element to template ${template.name} to clear this refusal`,
    })
}

function refineRecordTemplate(
  document: Parameters<typeof refineRecords>[0],
  record: Extract<DocumentNode, { type: 'record' }>,
  recordName: string,
  path: DocumentNodePath,
  template: TemplateNode,
  hostSlots: ReadonlySet<string>,
  ctx: z.RefinementCtx,
): void {
  if (template.parentRules !== undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['templates', document.templates.indexOf(template), 'parentRules'],
      message: `template ${template.name} has parentRules and cannot be used by a record; remove its parentRules because record pages use the document's parent rules, to clear this refusal`,
    })
  }
  if (!template.slots?.length) {
    const valueKeys = Object.keys(record.values ?? {})
    const namedValueKeys = valueKeys.map((key) => JSON.stringify(key)).join(', ')
    ctx.addIssue({
      code: 'custom',
      path: [...path, 'values'],
      message:
        valueKeys.length === 0
          ? `template ${template.name} has no slots for record ${recordName}; declare slots on template ${template.name} to clear this refusal`
          : `template ${template.name} has no slots, so record ${recordName}'s values ${namedValueKeys} cannot be placed; declare slots ${namedValueKeys} on template ${template.name} to clear this refusal`,
    })
    return
  }
  const declarations = new Set(template.slots.map((slot) => slot.key))
  for (const key of Object.keys(record.values ?? {})) {
    if (!declarations.has(key))
      ctx.addIssue({
        code: 'custom',
        path: [...path, 'values', key],
        message: `record value ${JSON.stringify(key)} is not declared by template ${template.name}; declare slot ${JSON.stringify(key)} on template ${template.name} or remove the value to clear this refusal`,
      })
  }
  const templatePath = ['templates', document.templates.indexOf(template)]
  for (const slot of template.slots) refineSlot(record, recordName, path, template, templatePath, slot, hostSlots, ctx)
}

function refineContinuousRecord(document: Parameters<typeof refineRecords>[0], recordName: string, path: DocumentNodePath, ctx: z.RefinementCtx): void {
  if (document.kind === 'book' && document.mode === 'continuous')
    ctx.addIssue({
      code: 'custom',
      path,
      message: `record ${recordName} restarts page numbering, which continuous layout cannot apply; use the paginated layout to clear this refusal`,
    })
}

function refineSlot(
  record: Extract<DocumentNode, { type: 'record' }>,
  recordName: string,
  recordPath: DocumentNodePath,
  template: TemplateNode,
  templatePath: DocumentNodePath,
  slot: NonNullable<TemplateNode['slots']>[number],
  hostSlots: ReadonlySet<string>,
  ctx: z.RefinementCtx,
): void {
  if (slot.required && record.values?.[slot.key] === undefined)
    ctx.addIssue({
      code: 'custom',
      path: [...recordPath, 'values'],
      message: `record ${recordName} has no value for required template slot ${JSON.stringify(slot.key)}; provide that value to clear this refusal`,
    })
  if (slot.type !== 'text')
    ctx.addIssue({
      code: 'custom',
      path: [...templatePath, 'slots'],
      message: `template slot ${JSON.stringify(slot.key)} has type ${slot.type}, but record values bind text only; change it to text or fill it through the host to clear this refusal`,
    })
  if (hostSlots.has(slot.key))
    ctx.addIssue({
      code: 'custom',
      path: [...templatePath, 'slots'],
      message: `template slot ${JSON.stringify(slot.key)} on ${template.name} is also declared in document data.slots; remove one declaration so the record and host fill do not both claim it`,
    })
}
