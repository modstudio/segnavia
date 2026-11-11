import type { Finding, SourceFile } from './rules.ts'
import { blankComments, blankCommentsAndLiterals, isPackageSource, TEST_FILE } from './source-text.ts'

export const DEFAULT_NEW_ID_SOURCE = 'packages/format/src/document-identity.ts'

export function checkRandomUuidSource(file: SourceFile): Finding[] {
  if (!isPackageSource(file.path) || TEST_FILE.test(file.path) || file.path === DEFAULT_NEW_ID_SOURCE) return []
  const source = blankCommentsAndLiterals(file.text)
  const bracketSource = blankComments(file.text)
  const matches = [/\brandomUUID\b/.exec(source), /\[\s*(['"])randomUUID\1\s*\]/.exec(bracketSource)].filter(
    (match): match is RegExpExecArray => match !== null,
  )
  const match = matches.sort((left, right) => left.index - right.index)[0]
  if (!match) return []
  const line = source.slice(0, match.index).split('\n').length
  return [
    {
      rule: 'random-uuid-source',
      path: `${file.path}:${line}`,
      message:
        'uses randomUUID directly; use defaultNewId from @segnavia/format, or ./document-identity.ts inside format, so ids work outside a secure context.',
    },
  ]
}
