import { copyFileSync, readFileSync } from 'node:fs'
import path from 'node:path'

export function copyDemoBundles(root: string, site: string) {
  // Each browser bundle contains its layer and every layer beneath it, so a page loads exactly one shipped file.
  const manifest = JSON.parse(readFileSync(path.join(root, 'packages/frame/package.json'), 'utf8')) as {
    exports: Record<string, { default: string }>
  }
  for (const [name, conditions] of Object.entries(manifest.exports).filter(([, entry]) => entry.default.startsWith('./dist/browser/'))) {
    const out = name === './browser/headless' ? 'segnavia.js' : `segnavia-${name.replace('./browser/', '')}.js`
    copyFileSync(path.join(root, 'packages/frame', conditions.default), path.join(site, out))
  }
}
