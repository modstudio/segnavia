import { describe, expect, test } from 'bun:test'
import { BUN_SUPPORTED_PACKAGES, PACKAGES, REACT_PACKAGE_ALLOWLIST, SOURCE_CONDITION } from '../../architecture.ts'
import { CHROMIUM_ENVIRONMENT_VARIABLE, CHROMIUM_PATH_MODULE } from '../chromium-path.ts'
import { checkRandomUuidSource, DEFAULT_NEW_ID_SOURCE } from './random-uuid-source.ts'
import {
  checkBunEngine,
  checkChromiumEnvironmentRead,
  checkComments,
  checkHostNames,
  checkImports,
  checkManifest,
  checkReactDependencies,
  checkSourceResolution,
  checkTypeScriptSuppressions,
  checkVueDependencies,
  type PackageManifestDependencies,
  type ResolutionInputs,
  type Workspace,
} from './rules.ts'
import { checkVueImports } from './vue-imports.ts'

const workspace = (name: string, exports = ['.']): Workspace => ({
  name: `@segnavia/${name}`,
  path: `packages/${name}/package.json`,
  rule: PACKAGES[name] as Workspace['rule'],
  exports,
  manifestImports: PACKAGES[name]?.imports ?? [],
  sources: [],
})
const all = new Map([
  ['@segnavia/format', workspace('format')],
  ['@segnavia/frame', workspace('frame', ['.', './svg', './bridge'])],
])
const bunWorkflow = (version: string) =>
  `jobs:\n  check:\n    steps: []\n  verify-render:\n    steps:\n      - uses: oven-sh/setup-bun@sha\n        with:\n          bun-version: ${version}\n  ci:\n    steps: []\n`
const bunManifests = (): PackageManifestDependencies[] => [
  ...BUN_SUPPORTED_PACKAGES.map((name) => ({
    name: `@segnavia/${name}`,
    path: `packages/${name}/package.json`,
    engines: { node: '>=22', bun: '>=1.4.2' },
  })),
  { name: '@segnavia/frame', path: 'packages/frame/package.json', engines: { node: '>=22' } },
]

describe('architecture rules', () => {
  test('a declared Bun floor must match the version verify-render proves', () => {
    const manifests = bunManifests()
    manifests[0] = { name: '@segnavia/render', path: 'packages/render/package.json', engines: { node: '>=22', bun: '>=1.5.0' } }
    expect(checkBunEngine(bunWorkflow('1.4.2'), manifests)).toEqual([
      {
        rule: 'bun-engine',
        path: 'packages/render/package.json',
        message:
          '@segnavia/render has >=1.5.0, expected >=1.4.2, because verify-render in .github/workflows/ci.yml runs Bun 1.4.2; change packages/render/package.json, that bun-version or BUN_SUPPORTED_PACKAGES in architecture.ts.',
      },
    ])
  })

  test('a package in the Bun support list must declare engines.bun', () => {
    const manifests = bunManifests()
    manifests[1] = { name: '@segnavia/format', path: 'packages/format/package.json', engines: { node: '>=22' } }
    expect(checkBunEngine(bunWorkflow('1.4.2'), manifests)).toEqual([
      {
        rule: 'bun-engine',
        path: 'packages/format/package.json',
        message:
          '@segnavia/format has no engines.bun declaration, expected >=1.4.2, because verify-render in .github/workflows/ci.yml runs Bun 1.4.2; change packages/format/package.json, that bun-version or BUN_SUPPORTED_PACKAGES in architecture.ts.',
      },
    ])
  })

  test('a package outside the Bun support list must not declare engines.bun', () => {
    const manifests = bunManifests()
    manifests[4] = { name: '@segnavia/frame', path: 'packages/frame/package.json', engines: { node: '>=22', bun: '>=1.4.2' } }
    expect(checkBunEngine(bunWorkflow('1.4.2'), manifests)).toEqual([
      {
        rule: 'bun-engine',
        path: 'packages/frame/package.json',
        message:
          '@segnavia/frame has >=1.4.2, expected no engines.bun declaration, because verify-render in .github/workflows/ci.yml runs Bun 1.4.2; change packages/frame/package.json, that bun-version or BUN_SUPPORTED_PACKAGES in architecture.ts.',
      },
    ])
  })

  test('a trailing YAML comment does not hide the verify-render Bun version', () => {
    expect(checkBunEngine(bunWorkflow('1.4.2 # pinned for the Bun leg'), bunManifests())).toEqual([])
  })

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

  test('a source may import a dependency that its build bundles', () => {
    const bundled = { ...workspace('diagrams'), devDependencies: { mermaid: '12.2.0' } }
    const file = { path: 'packages/diagrams/src/script.ts', text: '', imports: ['mermaid/dist/mermaid.min.js'] }
    expect(checkImports(file, bundled, all)).toEqual([])
  })

  test('test fixtures can be imported only by tests and test helpers in package source', () => {
    const source = { path: 'packages/render/src/color/reference.ts', text: '', imports: ['../../test-fixtures/lcms/reference.ts'] }
    expect(checkImports(source, workspace('render'), all).map((finding) => finding.message)).toContain(
      'package source may import test fixtures only from a test or test-helper module.',
    )
    const testFile = { ...source, path: 'packages/render/src/color/reference.test.ts' }
    expect(checkImports(testFile, workspace('render'), all)).toEqual([])
    const helper = { ...source, path: 'packages/render/src/color/reference.test-helper.ts' }
    expect(checkImports(helper, workspace('render'), all)).toEqual([])
    for (const escaped of ['../../../format/test-fixtures/foo.ts', '../../test-fixtures/../../../format/src/index.ts']) {
      const file = { path: 'packages/render/src/color/color.test.ts', text: '', imports: [escaped] }
      expect(checkImports(file, workspace('render'), all).map((finding) => finding.message)).toContain(
        `"${escaped}" reaches outside the package; import another package by name.`,
      )
    }
  })

  test('a server-safe entry point may not reach a browser-only file', () => {
    const file = { path: 'packages/frame/src/bridge.ts', text: '', imports: ['./deck.ts', './svg.ts'] }
    expect(checkImports(file, workspace('frame'), all).map((f) => f.message)).toEqual(['a server-safe entry point imports "./deck.ts", which is browser-only.'])
  })

  test('package.json and architecture.ts must agree both ways', () => {
    const drifted = { ...workspace('voice'), manifestImports: ['@segnavia/format', 'left-pad'] }
    expect(checkManifest(drifted).map((f) => f.message)).toEqual(['left-pad is a dependency that architecture.ts does not allow.'])
  })

  test('a bundled dependency must appear only in devDependencies', () => {
    const diagrams = workspace('diagrams')
    const bundled = {
      ...diagrams,
      devDependencies: { mermaid: '12.2.0' },
      sources: (diagrams.rule.serverSafe ?? []).map((source) => `packages/diagrams/${source}`),
    }
    expect(checkManifest(bundled)).toEqual([])
    const runtime = { ...bundled, dependencies: { mermaid: '12.2.0' } }
    expect(checkManifest(runtime).map((finding) => finding.message)).toEqual([
      '@segnavia/diagrams bundles mermaid; put mermaid in devDependencies and remove it from dependencies and peerDependencies to clear this refusal.',
    ])
  })

  test('only the modeled adapter package may name React in any dependency field', () => {
    const manifests = [
      { name: '@segnavia/react', path: 'packages/react/package.json', peerDependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' } },
      { name: '@segnavia/frame', path: 'packages/frame/package.json', devDependencies: { react: '^19.0.0' } },
      { name: '@segnavia/html', path: 'packages/html/package.json', optionalDependencies: { 'react-dom': '^19.0.0' } },
    ]
    expect(checkReactDependencies(manifests, REACT_PACKAGE_ALLOWLIST).map((finding) => finding.path)).toEqual([
      'packages/frame/package.json',
      'packages/html/package.json',
    ])
  })

  test('no package may name Vue in any dependency field', () => {
    const manifests = [
      { name: '@segnavia/frame', path: 'packages/frame/package.json', dependencies: { vue: '^3.5.0' } },
      { name: '@segnavia/html', path: 'packages/html/package.json', peerDependencies: { vue: '^3.5.0' } },
      { name: '@segnavia/format', path: 'packages/format/package.json', optionalDependencies: { vue: '^3.5.0' } },
      { name: '@segnavia/render', path: 'packages/render/package.json', devDependencies: { vue: '^3.5.0' } },
    ]
    expect(checkVueDependencies(manifests).map((finding) => finding.path)).toEqual([
      'packages/frame/package.json',
      'packages/html/package.json',
      'packages/format/package.json',
      'packages/render/package.json',
    ])
  })

  test('only the Vue type entries may import Vue and runtime modules cannot import them', () => {
    expect(checkVueImports({ path: 'packages/frame/src/vue.ts', text: "import type { DefineComponent } from 'vue'", imports: [] })).toEqual([])
    expect(checkVueImports({ path: 'packages/frame/src/index.ts', text: "import type {} from 'vue'", imports: [] })[0]?.message).toContain('may import vue')
    expect(checkVueImports({ path: 'packages/frame/src/index.ts', text: "import './vue.ts'", imports: [] })[0]?.message).toContain(
      'runtime module may not import',
    )
    for (const text of ["import type { Ref } from 'vue'", "import type {\n  Ref,\n  App,\n} from 'vue'", "import { type Ref } from 'vue'"]) {
      expect(checkVueImports({ path: 'packages/frame/src/index.ts', text, imports: [] })).toHaveLength(1)
    }
    expect(
      checkVueImports({ path: 'packages/frame/src/index.ts', text: "import type {\n  FrameVueEventDetails,\n} from './vue.ts'", imports: [] }),
    ).toHaveLength(1)
    expect(checkVueImports({ path: 'packages/frame/src/index.ts', text: "export type { FrameVueEventDetails } from './vue.ts'", imports: [] })).toHaveLength(1)
  })

  test('a Vue entry refuses a value import with the type-only fix', () => {
    const findings = checkVueImports({ path: 'packages/frame/src/vue.ts', text: "import { h } from 'vue'", imports: [] })
    expect(findings.map((finding) => finding.message)).toEqual(["a types-only Vue entry may import vue only with 'import type' or type-only specifiers."])
  })

  test('a nested relative import resolving to a Vue entry is refused', () => {
    const findings = checkVueImports({ path: 'packages/frame/src/nested/example.ts', text: "import type {} from '../vue.ts'", imports: [] })
    expect(findings[0]?.message).toContain('runtime module may not import the types-only Vue entry ../vue.ts')
  })

  test('a server-safe entry must name an existing source file', () => {
    const frame = workspace('frame')
    const drifted = { ...frame, sources: (frame.rule.serverSafe ?? []).filter((entry) => entry !== 'src/bridge.ts').map((entry) => `packages/frame/${entry}`) }
    expect(checkManifest(drifted).map((finding) => finding.message)).toEqual(['@segnavia/frame serverSafe entry src/bridge.ts names no source file.'])
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
  test('scripts use the shared Chromium lookup', () => {
    const direct = { path: 'scripts/example.ts', text: `const browser = process.env.${CHROMIUM_ENVIRONMENT_VARIABLE}`, imports: [] }
    expect(checkChromiumEnvironmentRead(direct)).toEqual([
      {
        rule: 'chromium-path',
        path: 'scripts/example.ts:1',
        message: 'reads the Chromium environment variable directly; use the shared chromiumPath() lookup.',
      },
    ])
    for (const text of [
      `process.env['${CHROMIUM_ENVIRONMENT_VARIABLE}']`,
      `Bun.env.${CHROMIUM_ENVIRONMENT_VARIABLE}`,
      `Bun.env["${CHROMIUM_ENVIRONMENT_VARIABLE}"]`,
      `const { ${CHROMIUM_ENVIRONMENT_VARIABLE} } = process.env`,
    ])
      expect(checkChromiumEnvironmentRead({ ...direct, text })).toHaveLength(1)
    for (const text of [`// process.env.${CHROMIUM_ENVIRONMENT_VARIABLE}`, `const help = 'set ${CHROMIUM_ENVIRONMENT_VARIABLE} to override the browser'`])
      expect(checkChromiumEnvironmentRead({ ...direct, text })).toEqual([])
    const belowComment = { ...direct, text: `/*\n one\n two\n*/\nconst browser = process.env.${CHROMIUM_ENVIRONMENT_VARIABLE}` }
    expect(checkChromiumEnvironmentRead(belowComment)[0]?.path).toBe('scripts/example.ts:5')
    expect(checkChromiumEnvironmentRead({ ...direct, path: CHROMIUM_PATH_MODULE })).toEqual([])
  })

  test('package sources use the shared id source', () => {
    const direct = { path: 'packages/frame/src/example.ts', text: 'const id = crypto.randomUUID()', imports: [] }
    expect(checkRandomUuidSource(direct)).toEqual([
      {
        rule: 'random-uuid-source',
        path: 'packages/frame/src/example.ts:1',
        message:
          'uses randomUUID directly; use defaultNewId from @segnavia/format, or ./document-identity.ts inside format, so ids work outside a secure context.',
      },
    ])
    for (const text of [
      'const makeId = crypto.randomUUID',
      "const id = crypto['randomUUID']()",
      'const { randomUUID } = crypto',
      'Document.parse(value, { newId: crypto.randomUUID })',
    ])
      expect(checkRandomUuidSource({ ...direct, text })).toHaveLength(1)
    expect(checkRandomUuidSource({ ...direct, path: DEFAULT_NEW_ID_SOURCE })).toEqual([])
    expect(checkRandomUuidSource({ ...direct, path: 'packages/frame/src/example.test.ts' })).toEqual([])
    expect(checkRandomUuidSource({ ...direct, text: '// crypto.randomUUID()' })).toEqual([])
    expect(checkRandomUuidSource({ ...direct, text: "const help = 'do not call crypto.randomUUID()'" })).toEqual([])
  })

  test('source blanking uses comment offsets when a string repeats a later comment', () => {
    const text = "const help = '// crypto.randomUUID()'\n// crypto.randomUUID()\nconst id = defaultNewId()"
    expect(checkRandomUuidSource({ path: 'packages/frame/src/example.ts', text, imports: [] })).toEqual([])
  })

  test('a comment telling history is caught; the same words in a string are not', () => {
    const text = "const a = 'previously'\n// This previously used a canvas.\n// Rings are padded so the edge stays visible."
    expect(checkComments({ path: 'x.ts', text, imports: [] })).toHaveLength(1)
  })

  test('a tracker key in a comment is caught', () => {
    expect(checkComments({ path: 'x.ts', text: '// see AB-2954', imports: [] })).toHaveLength(1)
  })

  test('TypeScript suppression directives are caught in packages and scripts', () => {
    for (const path of ['packages/render/src/example.ts', 'scripts/example.ts'])
      for (const name of ['nocheck', 'ignore', 'expect-error']) {
        const file = { path, text: `// @ts-${name}`, imports: [] }
        expect(checkTypeScriptSuppressions(file).map((finding) => finding.rule)).toEqual(['type-suppression'])
      }
    expect(checkTypeScriptSuppressions({ path: 'docs/example.ts', text: `// @ts-${'ignore'}`, imports: [] })).toEqual([])
  })

  test('code never names a host', () => {
    expect(checkHostNames({ path: 'packages/x/src/a.ts', text: 'const prefix = "Acme"', imports: [] }, ['acme'])).toHaveLength(1)
  })
})
