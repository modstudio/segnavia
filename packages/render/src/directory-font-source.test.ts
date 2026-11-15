import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type FontCatalog, isLimitExceeded, urlFontSource } from '@segnavia/format'
import { outcomeFromError } from './cli/protocol.ts'
import { directoryFontSource } from './directory-font-source.ts'
import { RenderRefusedError } from './errors.ts'

const roots: string[] = []
const signal = AbortSignal.any([])

async function root(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'segnavia-fonts-'))
  roots.push(path)
  return path
}

function catalog(src: string): FontCatalog {
  return { body: { family: 'Body', faces: [{ src, format: 'woff2' }] } }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('directoryFontSource', () => {
  test('loads and caches a regular face beneath the root', async () => {
    const path = await root()
    await writeFile(join(path, 'body.woff2'), Buffer.from('wOF2'))
    const source = directoryFontSource(catalog('body.woff2'), { root: path })
    const first = await source.font('body', { signal })
    const second = await source.font('body', { signal })
    expect(first).toBe(second)
    expect(first?.faces[0]?.data).toEqual(new Uint8Array(Buffer.from('wOF2')))
  })

  test('uses the same catalog face description as a host URL source', async () => {
    const path = await root()
    const bytes = Buffer.from('wOF2')
    await writeFile(join(path, 'body.woff2'), bytes)
    const shared = catalog('body.woff2')
    const directory = await directoryFontSource(shared, { root: path }).font('body', { signal })
    const url = await urlFontSource(shared, {
      baseUrl: 'https://fonts.example/',
      fetch: async () => new Response(bytes),
    }).font('body', { signal })
    expect(directory).toEqual(url)
  })

  test.each([
    ['an absolute path', (path: string) => join(path, 'body.woff2'), /absolute/],
    ['a parent escape', () => '../body.woff2', /escapes/],
    ['a missing file', () => 'missing.woff2', /missing/],
  ])('refuses %s', async (_label, src, message) => {
    const path = await root()
    const source = src(path)
    const error = await directoryFontSource(catalog(source), { root: path })
      .font('body', { signal })
      .then(
        () => undefined,
        (caught: unknown) => caught,
      )
    expect(error).toBeInstanceOf(RenderRefusedError)
    expect(error).toMatchObject({ code: 'font-source', subject: source })
    expect((error as Error).message).toMatch(message)
  })

  test('refuses a directory as src', async () => {
    const path = await root()
    await mkdir(join(path, 'face'))
    await expect(directoryFontSource(catalog('face'), { root: path }).font('body', { signal })).rejects.toThrow(/not a regular file/)
  })

  test('does no root I/O at construction and refuses a missing root on lookup', async () => {
    const path = join(tmpdir(), `segnavia-missing-font-root-${crypto.randomUUID()}`)
    const source = directoryFontSource(catalog('body.woff2'), { root: path })
    await Promise.resolve()
    await expect(source.font('body', { signal })).rejects.toBeInstanceOf(RenderRefusedError)
  })

  test('refuses a file above the per-face limit before reading it', async () => {
    const path = await root()
    await writeFile(join(path, 'body.woff2'), Buffer.from('wOF2x'))
    const source = directoryFontSource(catalog('body.woff2'), { root: path, limits: { each: 4 } })
    const error = await source.font('body', { signal }).then(
      () => undefined,
      (caught: unknown) => caught,
    )
    expect(error).toBeInstanceOf(Error)
    expect(isLimitExceeded(error)).toBe(true)
    const outcome = outcomeFromError(error)
    expect(outcome.exitCode).toBe(2)
    expect(JSON.parse(outcome.stderr).refusal.subject).toBe('fontSource.each')
    expect(error).toMatchObject({
      exceeded: [{ measure: 'fontSource.each', actual: 5, limit: 4, message: expect.any(String), where: expect.any(String) }],
    })
  })

  test('refuses a symbolic link outside the root', async () => {
    const path = await root()
    const outside = await root()
    await writeFile(join(outside, 'body.woff2'), Buffer.from('wOF2'))
    await symlink(join(outside, 'body.woff2'), join(path, 'body.woff2'))
    await expect(directoryFontSource(catalog('body.woff2'), { root: path }).font('body', { signal })).rejects.toThrow(/symbolic-link escape/)
  })
})
