import { collectRecords, type DocumentNode } from './document-nodes.ts'
import type { TemplateNode } from './document-nodes-book.ts'
import type { RecordFacts, RecordValues } from './record-facts.ts'
import { recordBodyFlow } from './record-refinement.ts'

export interface ExpandedRecordSection {
  id?: string
  title?: string
  opens: 'any'
  numbering: { restart: 1 }
  html: string
  values?: RecordValues
  record: RecordFacts
  recordTemplate?: { name: string; slots: NonNullable<TemplateNode['slots']> }
  recordBody?: string
}

function expandRecord(
  record: Extract<DocumentNode, { type: 'record' }>,
  offset: number,
  count: number,
  templates: ReadonlyMap<string, TemplateNode>,
): ExpandedRecordSection {
  const template = record.template === undefined ? undefined : templates.get(record.template)
  if (record.template !== undefined && !template?.slots)
    throw new Error(`record template ${JSON.stringify(record.template)} was not established during parsing`)
  const body = recordBodyFlow(record)
  if (!template && !body) throw new Error('record flow was not established during parsing')
  return {
    id: record.id,
    title: record.title,
    opens: 'any',
    numbering: { restart: 1 },
    html: template?.html ?? body?.html ?? '',
    ...(record.values === undefined ? {} : { values: record.values }),
    record: { index: offset + 1, count },
    ...(template ? { recordTemplate: { name: template.name, slots: template.slots ?? [] } } : {}),
    ...(template && body ? { recordBody: body.html } : {}),
  }
}

export function recordExpansion(document: {
  children: DocumentNode[]
  templates: TemplateNode[]
}): Map<Extract<DocumentNode, { type: 'record' }>, ExpandedRecordSection> {
  const records = collectRecords(document.children).map(({ node }) => node)
  const templates = new Map(document.templates.map((template) => [template.name, template]))
  return new Map(records.map((record, offset) => [record, expandRecord(record, offset, records.length, templates)]))
}
