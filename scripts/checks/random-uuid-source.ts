import type { Finding, SourceFile } from './rules.ts'
import { blankComments } from './source-text.ts'

export function checkRandomUuidSource(file: SourceFile): Finding[] {
  if (!/^packages\/[^/]+\/src\//.test(file.path) || /\.(?:test(?:-helper)?|spec)\.[mc]?[jt]sx?$/.test(file.path)) return []
  if (file.path === 'packages/format/src/document-identity.ts') return []
  const source = blankComments(file.text)
  const match = /(?:\.|\?\.)\s*randomUUID\s*(?:\?\.)?\s*\(/.exec(source)
  if (!match) return []
  const line = source.slice(0, match.index).split('\n').length
  return [
    {
      rule: 'random-uuid-source',
      path: `${file.path}:${line}`,
      message: 'calls randomUUID directly; use defaultNewId from @segnavia/format so ids work outside a secure context.',
    },
  ]
}
