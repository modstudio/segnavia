import { open, realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { catalogFontSource, type FontCatalog, type FontSource, type FontSourceLimits, LimitExceededError } from '@segnavia/format'
import { RenderRefusedError } from './errors.ts'

export interface DirectoryFontSourceOptions {
  root: string
  limits?: FontSourceLimits
}

function outside(root: string, file: string): boolean {
  const path = relative(root, file)
  return path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)
}

function srcRefusal(src: string, detail: string, remedy: string): RenderRefusedError {
  return new RenderRefusedError(`The directory font src ${JSON.stringify(src)} ${detail}; ${remedy} to clear this refusal.`, {
    code: 'font-source',
    subject: src,
  })
}

async function readFontFile(file: string, src: string, signal: AbortSignal, limit: number): Promise<Uint8Array> {
  let handle: Awaited<ReturnType<typeof open>>
  try {
    handle = await open(file, 'r')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    throw srcRefusal(src, 'is missing', 'provide a regular font file beneath the root')
  }
  try {
    const facts = await handle.stat()
    if (!facts.isFile()) throw srcRefusal(src, 'is not a regular file', 'provide a regular font file')
    if (facts.size > limit)
      throw new LimitExceededError('fontSource.each', facts.size, limit, {
        where: JSON.stringify(src),
      })
    return new Uint8Array(await handle.readFile({ signal }))
  } finally {
    await handle.close()
  }
}

async function resolveDirectoryRoot(root: string): Promise<string> {
  const resolved = await realpath(root)
  if (!(await stat(resolved)).isDirectory()) throw new Error('not a directory')
  return resolved
}

export function directoryFontSource(catalog: FontCatalog, options: DirectoryFontSourceOptions): FontSource {
  let root: Promise<string> | undefined
  const establishedRoot = async (): Promise<string> => {
    const pending = root ?? resolveDirectoryRoot(options.root)
    root = pending
    try {
      return await pending
    } catch {
      if (root === pending) root = undefined
      throw new RenderRefusedError(
        `The directory font source root ${JSON.stringify(options.root)} could not be established; provide an existing directory as root to clear this refusal.`,
        { code: 'font-source', subject: options.root },
      )
    }
  }
  return catalogFontSource(
    catalog,
    async (src, { signal, limit }) => {
      if (isAbsolute(src)) throw srcRefusal(src, 'is absolute', 'use a path beneath the font source root')
      const resolvedRoot = await establishedRoot()
      const requested = resolve(resolvedRoot, src)
      if (outside(resolvedRoot, requested)) throw srcRefusal(src, 'escapes the font source root', 'use a path beneath the root')
      let file: string
      try {
        file = await realpath(requested)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        throw srcRefusal(src, 'is missing', 'provide a regular font file beneath the root')
      }
      if (outside(resolvedRoot, file)) throw srcRefusal(src, 'resolves outside the font source root', 'remove the symbolic-link escape')
      return readFontFile(file, src, signal, limit)
    },
    { limits: options.limits },
  )
}
