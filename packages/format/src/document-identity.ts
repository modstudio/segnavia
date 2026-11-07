import type { DocumentNode } from './document-nodes.ts'

export interface DocumentParseOptions {
  newId?: () => string
}

export type IdentifiedNode = DocumentNode & { id: string; children?: IdentifiedNode[] }

type DefinitionNode = { type: string; id?: string; name?: string }

export type IdentifiedDocument<
  T extends {
    id?: string
    children: DocumentNode[]
    parentPages: DefinitionNode[]
    templates: DefinitionNode[]
    noteSeries: DefinitionNode[]
    variables: DefinitionNode[]
    conditions: DefinitionNode[]
  },
> = Omit<T, 'id' | 'children' | 'parentPages' | 'templates' | 'noteSeries' | 'variables' | 'conditions'> & {
  id: string
  children: IdentifiedNode[]
  parentPages: Array<T['parentPages'][number] & { id: string }>
  templates: Array<T['templates'][number] & { id: string }>
  noteSeries: Array<T['noteSeries'][number] & { id: string }>
  variables: Array<T['variables'][number] & { id: string }>
  conditions: Array<T['conditions'][number] & { id: string }>
}

function describe(node: { type: string; name?: string }, path: string): string {
  return `${node.type}${node.name ? ` "${node.name}"` : ''} at ${path}`
}

export function identifyDocument<
  T extends {
    type: 'document'
    id?: string
    children: DocumentNode[]
    parentPages: DefinitionNode[]
    templates: DefinitionNode[]
    noteSeries: DefinitionNode[]
    variables: DefinitionNode[]
    conditions: DefinitionNode[]
  },
>(document: T, options: DocumentParseOptions = {}): IdentifiedDocument<T> {
  const newId = options.newId ?? (() => globalThis.crypto.randomUUID())
  const seen = new Map<string, string>()
  const claim = <N extends { type: string; id?: string; name?: string }>(node: N, path: string): N & { id: string } => {
    const id = node.id ?? newId()
    if (!id) throw new Error(`${describe(node, path)} could not mint an id; return a non-empty id from newId to clear this refusal`)
    const first = seen.get(id)
    if (first) throw new Error(`id "${id}" is shared by ${first} and ${describe(node, path)}; change or remove one id to clear this refusal`)
    seen.set(id, describe(node, path))
    return { ...node, id }
  }
  const nodes = (values: DocumentNode[], path: string): IdentifiedNode[] =>
    values.map((value, index) => {
      const identified = claim(value, `${path}[${index}]`)
      return 'children' in identified
        ? ({ ...identified, children: nodes(identified.children, `${path}[${index}].children`) } as IdentifiedNode)
        : (identified as IdentifiedNode)
    })
  const definitions = <N extends DefinitionNode>(values: N[], path: string): Array<N & { id: string }> =>
    values.map((value, index) => claim(value, `${path}[${index}]`))
  const root = claim(document, 'document')
  return {
    ...root,
    children: nodes(document.children, 'children'),
    parentPages: definitions(document.parentPages, 'parentPages'),
    templates: definitions(document.templates, 'templates'),
    noteSeries: definitions(document.noteSeries, 'noteSeries'),
    variables: definitions(document.variables, 'variables'),
    conditions: definitions(document.conditions, 'conditions'),
  } as IdentifiedDocument<T>
}
