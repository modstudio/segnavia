import path from 'node:path'

export function hostNamesFile(root: string, commonDir: string, exists: (file: string) => boolean): string | undefined {
  const local = path.join(root, 'host-names.local')
  if (exists(local)) return local

  const main = path.join(path.dirname(commonDir), 'host-names.local')
  if (exists(main)) return main
}
