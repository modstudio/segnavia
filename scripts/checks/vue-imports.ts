import path from 'node:path'
import ts from 'typescript'
import { VUE_TYPE_ENTRIES } from '../../architecture.ts'
import type { Finding, SourceFile } from './rules.ts'

const vueEntries = Object.entries(VUE_TYPE_ENTRIES).map(([packageName, entry]) => ({
  path: `packages/${packageName}/${entry.source}`,
  specifier: `@segnavia/${packageName}${entry.exportName.slice(1)}`,
}))

function resolvesVueEntry(filePath: string, specifier: string): boolean {
  if (!specifier.startsWith('.')) return vueEntries.some((entry) => entry.specifier === specifier)
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(filePath), specifier))
  return vueEntries.some((entry) => {
    const withoutExtension = entry.path.replace(/\.ts$/, '')
    return resolved === entry.path || resolved === withoutExtension || resolved.replace(/\.js$/, '.ts') === entry.path
  })
}

function moduleSpecifier(node: ts.Node): string | null {
  if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
    return node.moduleSpecifier.text
  }
  return null
}

function typeOnlyVueImport(node: ts.Node): boolean {
  if (ts.isExportDeclaration(node)) return node.isTypeOnly
  if (!ts.isImportDeclaration(node)) return false
  const clause = node.importClause
  if (!clause) return false
  if (clause.isTypeOnly) return true
  return (
    !clause.name && !!clause.namedBindings && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.every((element) => element.isTypeOnly)
  )
}

export function checkVueImports(file: SourceFile): Finding[] {
  const source = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const entry = vueEntries.find(({ path: entryPath }) => entryPath === file.path)
  const findings: Finding[] = []
  for (const statement of source.statements) {
    const specifier = moduleSpecifier(statement)
    if (!specifier) continue
    if (specifier === 'vue') {
      if (!entry) {
        findings.push({ rule: 'vue-imports', path: file.path, message: 'only a declared types-only Vue entry may import vue.' })
      } else if (!typeOnlyVueImport(statement)) {
        findings.push({
          rule: 'vue-imports',
          path: file.path,
          message: "a types-only Vue entry may import vue only with 'import type' or type-only specifiers.",
        })
      }
    }
    if (resolvesVueEntry(file.path, specifier) && file.path !== entry?.path) {
      findings.push({ rule: 'vue-imports', path: file.path, message: `a runtime module may not import the types-only Vue entry ${specifier}.` })
    }
  }
  return findings
}
