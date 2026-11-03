import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { checkSideEffects, registersCustomElementAtModuleLevel, type SideEffectsPackage } from './side-effects.ts'

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
      'defines an element at load but ./dist/register.js is not in packages/example/package.json sideEffects; add it.',
    )
  })

  test('refuses a registering module listed only in its dist form', () => {
    const pkg = example(['./dist/register.js'], [{ path: 'packages/example/src/register.ts', text: `customElements.define('x-one', Element)` }])
    expect(checkSideEffects(pkg)[0]?.message).toBe(
      'defines an element at load but ./src/register.ts is not in packages/example/package.json sideEffects; add it.',
    )
  })

  test('refuses a stale entry that registers nothing', () => {
    const pkg = example(['./src/plain.ts', './dist/plain.js'], [{ path: 'packages/example/src/plain.ts', text: 'export const value = 1' }])
    expect(checkSideEffects(pkg).map((finding) => finding.message)).toEqual([
      './src/plain.ts does not register an element at load; remove it from sideEffects.',
      './dist/plain.js does not register an element at load; remove it from sideEffects.',
    ])
  })

  test('does not count a definition inside a function body', () => {
    expect(registersCustomElementAtModuleLevel('x.ts', `function install() { customElements.define('x-one', Element) }`)).toBeFalse()
  })

  test('counts a definition in a top-level for loop', () => {
    expect(registersCustomElementAtModuleLevel('x.ts', `for (const tag of tags) customElements.define(tag, Element)`)).toBeTrue()
  })
})
