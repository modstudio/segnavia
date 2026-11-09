import type { z } from 'zod'
import type { DocumentNode } from './document-nodes.ts'
import type { TemplateNode } from './document-nodes-book.ts'
import type { Slots } from './slots.ts'

type Path = (string | number)[]

function records(nodes: DocumentNode[], path: Path = ['children']): Array<{ node: Extract<DocumentNode, { type: 'record' }>; path: Path }> {
  return nodes.flatMap((node, index) => {
    const nodePath = [...path, index]
    const own = node.type === 'record' ? [{ node, path: nodePath }] : []
    return 'children' in node ? [...own, ...records(node.children, [...nodePath, 'children'])] : own
  })
}

export function refineRecords(
  document: { kind: string; mode?: string; children: DocumentNode[]; templates: TemplateNode[]; data?: { slots?: Slots } },
  ctx: z.RefinementCtx,
): void {
  const templates = new Map(document.templates.map((template) => [template.name, template]))
  const hostSlots = new Set(document.data?.slots?.map((slot) => slot.key) ?? [])
  for (const { node: record, path } of records(document.children)) {
    refineRecord(document, record, path, templates.get(record.template), hostSlots, ctx)
  }
}

function refineRecord(
  document: Parameters<typeof refineRecords>[0],
  record: Extract<DocumentNode, { type: 'record' }>,
  path: Path,
  template: TemplateNode | undefined,
  hostSlots: ReadonlySet<string>,
  ctx: z.RefinementCtx,
): void {
  if (!template) {
    ctx.addIssue({
      code: 'custom',
      path: [...path, 'template'],
      message: `record template ${JSON.stringify(record.template)} is not defined; define template ${JSON.stringify(record.template)} to clear this refusal`,
    })
    return
  }
  if (!template.slots?.length) {
    ctx.addIssue({
      code: 'custom',
      path: [...path, 'values'],
      message: `template ${template.name} has no slots for record ${record.id ?? path.join('.')}'s values; declare slots on template ${template.name} to clear this refusal`,
    })
    return
  }
  const declarations = new Set(template.slots.map((slot) => slot.key))
  for (const key of Object.keys(record.values)) {
    if (!declarations.has(key))
      ctx.addIssue({
        code: 'custom',
        path: [...path, 'values', key],
        message: `record value ${JSON.stringify(key)} is not declared by template ${template.name}; declare slot ${JSON.stringify(key)} on template ${template.name} or remove the value to clear this refusal`,
      })
  }
  const templatePath = ['templates', document.templates.indexOf(template)]
  for (const slot of template.slots) refineSlot(record, path, template, templatePath, slot, hostSlots, ctx)
  if (template.parents !== undefined)
    ctx.addIssue({
      code: 'custom',
      path: [...templatePath, 'parents'],
      message: `template ${template.name} has parents and cannot be used by a record; remove its parents because record pages use the document printed-page rules to clear this refusal`,
    })
  if (document.kind === 'book' && document.mode === 'continuous')
    ctx.addIssue({
      code: 'custom',
      path,
      message: `record ${record.id ?? path.join('.')} restarts page numbering, which continuous layout cannot apply; use the paginated layout to clear this refusal`,
    })
}

function refineSlot(
  record: Extract<DocumentNode, { type: 'record' }>,
  recordPath: Path,
  template: TemplateNode,
  templatePath: Path,
  slot: NonNullable<TemplateNode['slots']>[number],
  hostSlots: ReadonlySet<string>,
  ctx: z.RefinementCtx,
): void {
  if (slot.required && record.values[slot.key] === undefined)
    ctx.addIssue({
      code: 'custom',
      path: [...recordPath, 'values'],
      message: `record ${record.id ?? recordPath.join('.')} has no value for required template slot ${JSON.stringify(slot.key)}; provide that value to clear this refusal`,
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
