import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { checkSideEffects, runsCodeAtModuleLevel, type SideEffectsPackage } from './side-effects.ts'

function example(sideEffects: string[], sources: SideEffectsPackage['sources']): SideEffectsPackage {
  return { path: 'packages/example/package.json', sideEffects, sources }
}

describe('side-effect declarations', () => {
  test('the current frame package declaration matches its registering modules', () => {
    const root = path.resolve(import.meta.dir, '../..')
    const packagePath = 'packages/frame/package.json'
    const manifest = JSON.parse(readFileSync(path.join(root, packagePath), 'utf8')) as { sideEffects: string[] }
    const sources = [...new Bun.Glob('packages/frame/src/**/*.ts').scanSync({ cwd: root })].map((source) => ({
      path: source,
      text: readFileSync(path.join(root, source), 'utf8'),
    }))
    expect(checkSideEffects({ path: packagePath, sideEffects: manifest.sideEffects, sources })).toEqual([])
  })

  test('the diagrams package declares only its auto registration entry', () => {
    const root = path.resolve(import.meta.dir, '../..')
    const packagePath = 'packages/diagrams/package.json'
    const manifest = JSON.parse(readFileSync(path.join(root, packagePath), 'utf8')) as { sideEffects: string[] }
    const sources = [...new Bun.Glob('packages/diagrams/src/**/*.ts').scanSync({ cwd: root })].map((source) => ({
      path: source,
      text: readFileSync(path.join(root, source), 'utf8'),
    }))
    expect(checkSideEffects({ path: packagePath, sideEffects: manifest.sideEffects, sources })).toEqual([])
  })

  test('refuses a missing registering entry', () => {
    const pkg = example([], [{ path: 'packages/example/src/register.ts', text: `customElements.define('x-one', Element)` }])
    expect(checkSideEffects(pkg)[0]?.message).toBe(
      'runs code when imported but ./dist/register.js is not in packages/example/package.json sideEffects; add it.',
    )
  })

  test('refuses a registering module listed only in its dist form', () => {
    const pkg = example(['./dist/register.js'], [{ path: 'packages/example/src/register.ts', text: `customElements.define('x-one', Element)` }])
    expect(checkSideEffects(pkg)[0]?.message).toBe('runs code when imported but ./src/register.ts is not in packages/example/package.json sideEffects; add it.')
  })

  test('refuses a stale entry that registers nothing', () => {
    const pkg = example(['./src/plain.ts', './dist/plain.js'], [{ path: 'packages/example/src/plain.ts', text: 'export const value = 1' }])
    expect(checkSideEffects(pkg).map((finding) => finding.message)).toEqual([
      './src/plain.ts does not run code when imported; remove it from sideEffects.',
      './dist/plain.js does not run code when imported; remove it from sideEffects.',
    ])
  })

  test('counts a top-level registration call', () => {
    expect(runsCodeAtModuleLevel('x.ts', 'registerDiagramProvider(diagrams)')).toBeTrue()
  })

  test('does not count a call inside a declaration initializer', () => {
    expect(runsCodeAtModuleLevel('x.ts', 'const registered = registerDiagramProvider(diagrams)')).toBeFalse()
  })

  test('does not require test-helper modules with top-level calls to be listed', () => {
    const pkg = example([], [{ path: 'packages/example/src/setup.test-helper.ts', text: 'installTestGlobals()' }])
    expect(checkSideEffects(pkg)).toEqual([])
  })

  test('does not count a definition inside a function body', () => {
    expect(runsCodeAtModuleLevel('x.ts', `function install() { customElements.define('x-one', Element) }`)).toBeFalse()
  })

  test('counts a custom element definition in a top-level for loop', () => {
    expect(runsCodeAtModuleLevel('x.ts', `for (const tag of tags) customElements.define(tag, Element)`)).toBeTrue()
  })
})
