// The declared shape of the repository: what each package may import and
// where it may run. `scripts/checks/architecture.ts` enforces it; a boundary
// that is not written here is not a boundary.

export type Runtime = 'universal' | 'browser' | 'server'

export const SOURCE_CONDITION = '@segnavia/source'

export const platformForRuntime = (runtime: Runtime): 'browser' | 'node' | 'neutral' =>
  runtime === 'server' ? 'node' : runtime === 'browser' ? 'browser' : 'neutral'

export interface PackageRule {
  // universal: runs in a browser and on a server, so no Node built-ins.
  // browser: may use the DOM. server: may use Node built-ins.
  runtime: Runtime
  // Every package this one may import, by bare name. A workspace package may
  // be imported only through an entry point its package.json exports.
  imports: string[]
  // Entry points that must stay importable on a server although the package
  // as a whole is for the browser, with the files each may reach.
  serverSafe?: string[]
}

export const PACKAGES: Record<string, PackageRule> = {
  format: { runtime: 'universal', imports: ['zod'] },
  html: { runtime: 'universal', imports: ['htmlparser2', 'domhandler', 'dom-serializer'] },
  frame: {
    runtime: 'browser',
    imports: ['@segnavia/format'],
    serverSafe: ['src/svg.ts', 'src/timeline.ts', 'src/bridge.ts', 'src/print-document.ts', 'src/styled-elements.ts'],
  },
  voice: { runtime: 'server', imports: ['@segnavia/format'] },
  render: { runtime: 'server', imports: ['@segnavia/format', '@segnavia/frame', 'playwright-core', 'pdf-lib'] },
  capture: { runtime: 'server', imports: ['@segnavia/format', '@segnavia/frame', '@segnavia/render', 'playwright-core'] },
}

// A source file at the ceiling may only shrink: split out a concern instead.
export const FILE_CEILING_LINES = 400
