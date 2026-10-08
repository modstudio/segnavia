import { describe, expect, test } from 'bun:test'
import { dependencyOrder, packedPackageRefusal, publishedPackageRefusal, registryState, releaseDecision } from './publish-policy.ts'

const workspaceNames = new Set(['@segnavia/format', '@segnavia/frame'])

describe('dependencyOrder', () => {
  test('places every workspace dependency before its consumer', () => {
    const packages = [
      { name: '@segnavia/capture', dependencies: ['@segnavia/render', '@segnavia/format'] },
      { name: '@segnavia/format', dependencies: [] },
      { name: '@segnavia/render', dependencies: ['@segnavia/frame', '@segnavia/format'] },
      { name: '@segnavia/frame', dependencies: ['@segnavia/format'] },
    ]
    expect(dependencyOrder(packages)).toEqual(['@segnavia/format', '@segnavia/frame', '@segnavia/render', '@segnavia/capture'])
  })

  test('refuses a dependency cycle', () => {
    expect(() =>
      dependencyOrder([
        { name: 'one', dependencies: ['two'] },
        { name: 'two', dependencies: ['one'] },
      ]),
    ).toThrow('Could not establish package dependency order')
  })
})

describe('packedPackageRefusal', () => {
  test('refuses workspace ranges in any dependency kind', () => {
    expect(
      packedPackageRefusal(
        { name: '@segnavia/frame', version: '0.1.0', peerDependencies: { '@segnavia/format': 'workspace:*' } },
        '0.1.0',
        true,
        workspaceNames,
      ),
    ).toContain('still contains workspace:')
  })

  test('refuses a packed workspace dependency left at a stale version', () => {
    expect(
      packedPackageRefusal({ name: '@segnavia/frame', version: '0.1.1', dependencies: { '@segnavia/format': '0.1.0' } }, '0.1.1', true, workspaceNames),
    ).toBe(
      '@segnavia/frame@0.1.1 depends on workspace package @segnavia/format at 0.1.0 instead of 0.1.1. Run bun run version, or bun install, to refresh bun.lock.',
    )
  })

  test('refuses a version different from the other packages', () => {
    expect(packedPackageRefusal({ name: '@segnavia/frame', version: '0.2.0' }, '0.1.0', true, workspaceNames)).toContain('does not match 0.1.0')
  })

  test('refuses a tarball without the licence', () => {
    expect(packedPackageRefusal({ name: '@segnavia/frame', version: '0.1.0' }, '0.1.0', false, workspaceNames)).toContain('does not contain LICENSE')
  })
})

describe('registry and release decisions', () => {
  test('distinguishes a missing version from a registry failure', () => {
    expect(registryState(0, '', '')).toBe('missing')
    expect(registryState(1, '', 'npm error code E404')).toBe('missing')
    expect(() => registryState(1, '', 'npm error code EAI_AGAIN')).toThrow('Could not reach the npm registry')
  })

  test('publishes only a missing version', () => {
    expect(releaseDecision('missing')).toBe('publish')
    expect(releaseDecision('published')).toBe('skip')
  })

  test('refuses to skip a published version with different contents', () => {
    expect(publishedPackageRefusal('@segnavia/frame', '0.1.0', 'sha512-local', 'sha512-registry')).toBe(
      '@segnavia/frame@0.1.0 has local integrity sha512-local but npm has sha512-registry. Release a new version.',
    )
    expect(publishedPackageRefusal('@segnavia/frame', '0.1.0', 'sha512-same', 'sha512-same')).toBeUndefined()
  })
})
