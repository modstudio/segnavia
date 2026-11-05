import { describe, expect, test } from 'bun:test'
import { releaseNotes } from './release-notes.ts'

describe('releaseNotes', () => {
  test('groups changes by alphabetically ordered package and change type', () => {
    const notes = releaseNotes('1.2.3', [
      {
        packageName: '@segnavia/zebra',
        changelogPath: 'workspaces/zebra/CHANGELOG.md',
        changelogText: '# zebra\n\n## 1.2.3\n\n### Patch Changes\n\n- bbb2222: Patch zebra.\n',
      },
      {
        packageName: '@segnavia/alpha',
        changelogPath: 'workspaces/alpha/CHANGELOG.md',
        changelogText: '# alpha\n\n## 1.2.3\n\n### Minor Changes\n\n- aaa1111: Add alpha.\n\n## 1.2.2\n\n### Patch Changes\n\n- old0000: Old.\n',
      },
    ])

    expect(notes).toBe(
      '## @segnavia/alpha\n\n### Minor Changes\n\n- aaa1111: Add alpha.\n\n## @segnavia/zebra\n\n### Patch Changes\n\n- bbb2222: Patch zebra.\n',
    )
  })

  test('drops updated dependencies entries and their nested package lines', () => {
    const notes = releaseNotes('1.2.3', [
      {
        packageName: '@segnavia/frame',
        changelogPath: 'packages/frame/CHANGELOG.md',
        changelogText:
          '## 1.2.3\n\n### Patch Changes\n\n- abc1234: Keep this.\n- Updated dependencies [abc1234]\n  - @segnavia/format@1.2.3\n  - @segnavia/html@1.2.3\n',
      },
    ])

    expect(notes).toBe('## @segnavia/frame\n\n### Patch Changes\n\n- abc1234: Keep this.\n')
  })

  test('separates kept entries and preserves a multi-paragraph entry', () => {
    const notes = releaseNotes('1.2.3', [
      {
        packageName: '@segnavia/frame',
        changelogPath: 'packages/frame/CHANGELOG.md',
        changelogText: '## 1.2.3\n\n### Patch Changes\n\n- abc1234: First paragraph.\n\n  Second paragraph.\n\n- def5678: Second entry.\n',
      },
    ])

    expect(notes).toBe('## @segnavia/frame\n\n### Patch Changes\n\n- abc1234: First paragraph.\n\n  Second paragraph.\n\n- def5678: Second entry.\n')
  })

  test('drops bare internal dependency bullets', () => {
    const notes = releaseNotes('1.2.3', [
      {
        packageName: '@segnavia/frame',
        changelogPath: 'packages/frame/CHANGELOG.md',
        changelogText: '## 1.2.3\n\n### Patch Changes\n\n- abc1234: Keep this.\n\n- @segnavia/format@0.42.0\n',
      },
    ])

    expect(notes).toBe('## @segnavia/frame\n\n### Patch Changes\n\n- abc1234: Keep this.\n')
  })

  test('lists a repeated entry once and omits a package emptied by deduplication', () => {
    const shared = '- abc1234: Shared change.'
    const notes = releaseNotes('1.2.3', [
      { packageName: '@segnavia/beta', changelogPath: 'packages/beta/CHANGELOG.md', changelogText: `## 1.2.3\n\n### Patch Changes\n\n${shared}\n` },
      { packageName: '@segnavia/alpha', changelogPath: 'packages/alpha/CHANGELOG.md', changelogText: `## 1.2.3\n\n### Minor Changes\n\n${shared}\n` },
    ])

    expect(notes).toBe('## @segnavia/alpha\n\n### Minor Changes\n\n- abc1234: Shared change.\n')
  })

  test('refuses when the version is absent and names every changelog read', () => {
    expect(() =>
      releaseNotes('9.9.9', [
        { packageName: '@segnavia/frame', changelogPath: 'workspaces/frame/CHANGELOG.md', changelogText: '## 1.2.3\n' },
        { packageName: '@segnavia/format', changelogPath: 'workspaces/format/CHANGELOG.md', changelogText: '## 1.2.3\n' },
      ]),
    ).toThrow(
      'Could not find version 9.9.9 in the CHANGELOG files read: workspaces/frame/CHANGELOG.md, workspaces/format/CHANGELOG.md. Run bun run version so each package changelog gains a section for 9.9.9, then release again.',
    )
  })
})
