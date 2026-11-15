import { readFile, realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { catalogFontSource, type FontCatalog, type FontSource, type FontSourceLimits } from '@segnavia/format'

export interface DirectoryFontSourceOptions {
  root: string
  limits?: FontSourceLimits
}

function outside(root: string, file: string): boolean {
  const path = relative(root, file)
  return path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)
}

export function directoryFontSource(catalog: FontCatalog, options: DirectoryFontSourceOptions): FontSource {
  const root = realpath(options.root)
  return catalogFontSource(
    catalog,
    async (src, { signal }) => {
      if (isAbsolute(src))
        throw new Error(`The directory font src ${JSON.stringify(src)} is absolute; use a path beneath the font source root to clear this refusal.`)
      const establishedRoot = await root
      const requested = resolve(establishedRoot, src)
      if (outside(establishedRoot, requested))
        throw new Error(`The directory font src ${JSON.stringify(src)} escapes the font source root; use a path beneath the root to clear this refusal.`)
      let file: string
      try {
        file = await realpath(requested)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        throw new Error(`The directory font src ${JSON.stringify(src)} is missing; provide a regular font file beneath the root to clear this refusal.`)
      }
      if (outside(establishedRoot, file))
        throw new Error(
          `The directory font src ${JSON.stringify(src)} resolves outside the font source root; remove the symbolic-link escape to clear this refusal.`,
        )
      const facts = await stat(file)
      if (!facts.isFile())
        throw new Error(`The directory font src ${JSON.stringify(src)} is not a regular file; provide a regular font file to clear this refusal.`)
      return new Uint8Array(await readFile(file, { signal }))
    },
    { limits: options.limits },
  )
}
