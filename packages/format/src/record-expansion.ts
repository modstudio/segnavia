import type { DocumentNode } from './document-nodes.ts'
import type { TemplateNode } from './document-nodes-book.ts'

export interface ExpandedRecordSection {
  id?: string
  title?: undefined
  opens: 'any'
  numbering: { restart: 1 }
  html: string
  values: Record<string, string>
  record: { index: number; count: number }
  recordTemplate: Pick<TemplateNode, 'name' | 'slots'>
}

function collect(nodes: DocumentNode[]): Array<Extract<DocumentNode, { type: 'record' }>> {
  return nodes.flatMap((node) => [...(node.type === 'record' ? [node] : []), ...('children' in node ? collect(node.children) : [])])
}

export function recordExpansion(document: { children: DocumentNode[]; templates: TemplateNode[] }): Map<Extract<DocumentNode, { type: 'record' }>, ExpandedRecordSection> {
  const records = collect(document.children)
  const templates = new Map(document.templates.map((template) => [template.name, template]))
  return new Map(records.map((record, offset) => {
    const template = templates.get(record.template)
    if (!template?.slots) throw new Error(`record template ${JSON.stringify(record.template)} was not established during parsing`)
    return [record, { id: record.id, opens: 'any', numbering: { restart: 1 }, html: template.html, values: record.values, record: { index: offset + 1, count: records.length }, recordTemplate: { name: template.name, slots: template.slots } }]
  }))
}
