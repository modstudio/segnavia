import { copyFileSync, readFileSync } from 'node:fs'
import path from 'node:path'

export function copyDemoBundles(root: string, site: string) {
  // Each browser bundle contains its layer and every layer beneath it. Its only sibling is the diagram chunk, loaded lazily when needed.
  const manifest = JSON.parse(readFileSync(path.join(root, 'packages/frame/package.json'), 'utf8')) as {
    exports: Record<string, { default: string }>
  }
  const lazyChunks = new Set<string>()
  for (const [name, conditions] of Object.entries(manifest.exports).filter(([, entry]) => entry.default.startsWith('./dist/browser/'))) {
    const out = name === './browser/headless' ? 'segnavia.js' : `segnavia-${name.replace('./browser/', '')}.js`
    const source = path.join(root, 'packages/frame', conditions.default)
    copyFileSync(source, path.join(site, out))
    const imports = new Bun.Transpiler({ loader: 'js' }).scan(readFileSync(source, 'utf8')).imports
    for (const item of imports.filter((item) => item.kind === 'dynamic-import')) lazyChunks.add(item.path)
  }
  for (const chunk of lazyChunks) copyFileSync(path.join(root, 'packages/frame/dist/browser', chunk), path.join(site, chunk))
}
