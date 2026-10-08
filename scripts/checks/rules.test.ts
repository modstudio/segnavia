import { describe, expect, test } from 'bun:test'
import { PACKAGES, SOURCE_CONDITION } from '../../architecture.ts'
import { checkComments, checkHostNames, checkImports, checkManifest, checkSourceResolution, type ResolutionInputs, type Workspace } from './rules.ts'

const workspace = (name: string, exports = ['.']): Workspace => ({
  name: `@segnavia/${name}`,
  rule: PACKAGES[name] as Workspace['rule'],
  exports,
  dependencies: PACKAGES[name]?.imports ?? [],
})
const all = new Map([
  ['@segnavia/format', workspace('format')],
  ['@segnavia/frame', workspace('frame', ['.', './svg', './bridge'])],
])

describe('architecture rules', () => {
  test('a universal package may not import Node', () => {
    const findings = checkImports({ path: 'packages/format/src/index.ts', text: '', imports: ['node:fs'] }, workspace('format'), all)
    expect(findings.map((f) => f.message)).toEqual(['a universal package imports node:fs.'])
  })

  test('a package may import another only through an entry point it exports', () => {
    const file = { path: 'packages/render/src/index.ts', text: '', imports: ['@segnavia/frame/svg', '@segnavia/frame/src/deck.ts'] }
    expect(checkImports(file, workspace('render'), all).map((f) => f.message)).toEqual([
      '@segnavia/frame/src/deck.ts is not an entry point @segnavia/frame exports.',
    ])
  })

  test('an undeclared dependency is refused with where to declare it', () => {
    const file = { path: 'packages/voice/src/index.ts', text: '', imports: ['playwright-core'] }
    expect(checkImports(file, workspace('voice'), all)[0]?.message).toContain('declare it in architecture.ts')
  })

  test('a server-safe entry point may not reach a browser-only file', () => {
    const file = { path: 'packages/frame/src/bridge.ts', text: '', imports: ['./deck.ts', './svg.ts'] }
    expect(checkImports(file, workspace('frame'), all).map((f) => f.message)).toEqual(['a server-safe entry point imports "./deck.ts", which is browser-only.'])
  })

  test('package.json and architecture.ts must agree both ways', () => {
    const drifted = { ...workspace('voice'), dependencies: ['@segnavia/format', 'left-pad'] }
    expect(checkManifest(drifted).map((f) => f.message)).toEqual(['left-pad is a dependency that architecture.ts does not allow.'])
  })

  test('source resolution stays consistent across manifests, TypeScript and commands', () => {
    const inputs: ResolutionInputs = {
      sourceCondition: SOURCE_CONDITION,
      packages: [
        {
          path: 'packages/format/package.json',
          exports: { '.': { types: './dist/index.d.ts', '@segnavia/wrong': './src/index.ts', default: './dist/index.js' } },
        },
      ],
      customConditions: ['@segnavia/wrong'],
      scripts: { test: 'bun --conditions=@segnavia/wrong test' },
    }
    const findings = checkSourceResolution(inputs)
    expect(findings.map((finding) => finding.path)).toEqual(['packages/format/package.json', 'packages/format/package.json', 'tsconfig.json', 'package.json'])
    expect(findings.every((finding) => finding.message.includes(SOURCE_CONDITION))).toBe(true)
  })
})

describe('writing rules', () => {
  test('a comment telling history is caught; the same words in a string are not', () => {
    const text = "const a = 'previously'\n// This previously used a canvas.\n// Rings are padded so the edge stays visible."
    expect(checkComments({ path: 'x.ts', text, imports: [] })).toHaveLength(1)
  })

  test('a tracker key in a comment is caught', () => {
    expect(checkComments({ path: 'x.ts', text: '// see AB-2954', imports: [] })).toHaveLength(1)
  })

  test('code never names a host', () => {
    expect(checkHostNames({ path: 'packages/x/src/a.ts', text: 'const prefix = "Acme"', imports: [] }, ['acme'])).toHaveLength(1)
  })
})
