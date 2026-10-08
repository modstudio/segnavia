// The seam between the capture engine and the app it photographs. The engine
// knows browsers, flows, steps, shots and annotations; everything about one
// app (how to sign in, what to hide, what its API needs between pages, what
// its flows may call) arrives through a Host. Nothing in this package names a
// product, and a host's adapter lives in the host's own repository.

import type { Browser, BrowserContextOptions, Page, Response } from 'playwright-core'
import type { ShotSpec } from './shot.ts'

export interface FlowIdentity {
  name: string
  // Which of the host's sessions the flow runs as, such as "guest". The host
  // decides what each name means.
  session?: string
}

export interface HostSession<Extras> {
  // Options for every flow's browser context: storage state, locale, timezone.
  context?: BrowserContextOptions
  // Per flow, for a host whose flows run as different sessions.
  contextFor?(flow: FlowIdentity): BrowserContextOptions | Promise<BrowserContextOptions>
  // Applied to every document a flow opens: what must not appear in a shot.
  injectCss?: string
  // Helpers a host's flows need beside the engine's own, such as an API
  // client or seeded data. Built per flow, so costly ones can be lazy.
  extras?(page: Page, flow: FlowIdentity): Extras | Promise<Extras>
  // Called before each navigation, for a host that must wait for capacity.
  beforeNavigate?(url: string): Promise<void>
  observe?(response: Response, flow: FlowIdentity): void
  // A reason refuses the shot, so a host can veto a screen it knows is broken.
  refuseShot?(shot: ShotSpec, flow: FlowIdentity): string | null
  close?(): Promise<void>
}

export interface Host<Extras = Record<string, never>> {
  open(env: { browser: Browser; baseUrl: string }): Promise<HostSession<Extras>>
}
