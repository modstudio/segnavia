// The demo app's adapter: everything the capture engine must not know about
// this app lives here, as it would in a real host's own repository.

import type { Flow, Host } from '@segnavia/capture'

export interface DemoExtras {
  // The app's API, as a host's flows would call it between steps.
  api(path: string): Promise<number>
}

// What the adapter observed, so a run can be checked against the seams.
export const observed = { navigations: 0, extrasBuilt: [] as string[], rateLimited: [] as string[], hiddenAfterNavigation: [] as boolean[] }

export function demoHost(baseUrl: string): Host<DemoExtras> {
  return {
    async open() {
      const limited = new Set<string>()
      return {
        // Signed-in flows carry the session cookie; a guest flow carries none.
        contextFor: (flow) => ({
          storageState: {
            cookies:
              flow.session === 'guest'
                ? []
                : [
                    {
                      name: 'session',
                      value: 'teacher',
                      domain: new URL(baseUrl).hostname,
                      path: '/',
                      expires: -1,
                      httpOnly: false,
                      secure: false,
                      sameSite: 'Lax' as const,
                    },
                  ],
            origins: [],
          },
        }),
        // The signed-in name is not part of what any shot is of.
        injectCss: '.profile, .toast { visibility: hidden !important; } * { caret-color: transparent !important; }',
        extras: (page, flow) => {
          observed.extrasBuilt.push(flow.name)
          return { api: async (path: string) => (await page.request.get(`${baseUrl}${path}`)).status() }
        },
        beforeNavigate: async () => {
          observed.navigations++
        },
        observe: (response, flow) => {
          if (response.status() === 429) limited.add(flow.name)
        },
        refuseShot: (shot, flow) => {
          if (!limited.has(flow.name)) return null
          observed.rateLimited.push(flow.name)
          return `the API rate-limited the page, so ${shot.key} may show a broken screen`
        },
      }
    },
  }
}

export const demoFlows: Flow<DemoExtras>[] = [
  {
    name: 'classes',
    async run(flow) {
      await flow.step('open the class list', () => flow.goto('/'))
      await flow.shot({
        key: 'classes.list',
        title: 'Your classes',
        annotate: [{ target: { role: 'button', name: 'New class' }, number: 1 }],
      })
      await flow.step('open the new class form', async () => {
        await flow.page.getByRole('button', { name: 'New class' }).click()
        await flow.page.getByLabel('Class name').fill('Afternoon art')
      })
      await flow.shot({
        key: 'classes.create.form',
        title: 'Create a class: the form',
        annotate: [
          { target: { label: 'Class name' }, number: 2 },
          { target: { label: 'Grade' }, number: 3 },
          { target: { role: 'button', name: 'Create', within: { role: 'dialog' } }, arrow: 'right', label: 'Save it' },
        ],
      })
    },
  },
  {
    name: 'classes-he',
    async run(flow) {
      await flow.step('open the class list', () => flow.goto('/he'))
      await flow.shot({
        key: 'he.classes.list',
        title: 'הכיתות שלך',
        annotate: [{ target: { role: 'button', name: 'כיתה חדשה' }, number: 1 }],
      })
      await flow.step('open the new class form', async () => {
        await flow.page.getByRole('button', { name: 'כיתה חדשה' }).click()
        await flow.page.getByLabel('שם הכיתה').fill('אמנות אחר הצהריים')
      })
      await flow.shot({
        key: 'he.classes.create.form',
        title: 'יצירת כיתה: הטופס',
        annotate: [
          { target: { label: 'שם הכיתה' }, number: 2 },
          { target: { label: 'שכבה' }, number: 3 },
          { target: { role: 'button', name: 'יצירה', within: { role: 'dialog' } }, arrow: 'left', label: 'לשמירה' },
        ],
      })
    },
  },
  {
    name: 'guest',
    session: 'guest',
    async run(flow) {
      await flow.step('open the class list signed out', () => flow.goto('/'))
      // Present only signed out, so the shot proves the guest session.
      await flow.shot({ key: 'guest.home', title: 'Signed out', annotate: [{ target: { text: 'Sign in' }, number: 1 }] })
    },
  },
  {
    name: 'compact',
    async run(flow) {
      const status = await flow.step('ask the API', () => flow.extras.api('/api/ping'))
      if (status !== 200) throw new Error(`the API answered ${status}`)
      await flow.step('choose the compact layout', () => flow.setLocalStorage({ layout: 'compact' }))
      await flow.step('reload in it', () => flow.goto('/'))
      await flow.until(() => document.body.classList.contains('compact'), 'the compact layout')
      await flow.viewport({ width: 800, height: 600 })
      await flow.shot({
        key: 'classes.compact',
        title: 'The compact layout',
        description: 'A narrower window, with the compact layout chosen.',
        tags: ['layout'],
        annotate: [
          { target: { text: 'Morning', exact: false }, number: 1 },
          { target: { css: '#new' }, arrow: 'auto', label: 'Add' },
        ],
      })
    },
  },
  {
    name: 'refused',
    async run(flow) {
      await flow.step('open a screen whose API is busy', () => flow.goto('/busy'))
      await flow.page.waitForLoadState('networkidle')
      await flow.shot({ key: 'refused.busy', title: 'Never taken' })
    },
  },
  {
    name: 'broken',
    async run(flow) {
      await flow.step('open the class list', () => flow.goto('/'))
      await flow.shot({ key: 'broken.missing', title: 'Never taken', annotate: [{ target: { role: 'button', name: 'Archive' }, number: 1 }] })
    },
  },
  {
    name: 'signed-in',
    async run(flow) {
      await flow.step('open with the teacher session', () => flow.goto('/'))
      await flow.shot({ key: 'signed.home', title: 'Signed in', annotate: [{ target: { text: 'Teacher tools' }, number: 1 }] })
    },
  },
  {
    name: 'hidden',
    async run(flow) {
      for (const url of ['/', '/again']) {
        await flow.step(`navigate to ${url}`, () => flow.goto(url))
        observed.hiddenAfterNavigation.push(
          await flow.page.evaluate(() =>
            ['.profile', '.toast'].every((selector) => {
              const element = document.querySelector(selector)
              return element !== null && getComputedStyle(element).visibility === 'hidden'
            }),
          ),
        )
      }
      await flow.shot({ key: 'hidden.after-navigation', title: 'Host CSS after navigation' })
    },
  },
  {
    name: 'delayed',
    async run(flow) {
      await flow.step('open the delayed image', () => flow.goto('/late'))
      await flow.until(() => (document.querySelector('#late-image img') as HTMLImageElement | null)?.complete === true, 'the delayed image')
      await flow.shot({ key: 'delayed.complete', title: 'Delayed image complete', annotate: [{ target: { css: '#late-target' }, number: 1 }] })
    },
  },
  {
    name: 'settling',
    async run(flow) {
      await flow.step('open the late image', () => flow.goto('/settling'))
      await flow.shot({ key: 'settling.complete', title: 'Settled image complete', annotate: [{ target: { css: '#late-target' }, number: 1 }] })
    },
  },
  {
    name: 'ambiguous',
    async run(flow) {
      await flow.step('open duplicate targets', () => flow.goto('/targets'))
      await flow.shot({ key: 'ambiguous.target', title: 'Never taken', annotate: [{ target: { text: 'Same target' }, number: 1 }] })
    },
  },
  {
    name: 'outside',
    async run(flow) {
      await flow.step('open an offscreen target', () => flow.goto('/targets'))
      await flow.shot({
        key: 'outside.target',
        title: 'Never taken',
        annotate: [
          { target: { css: '.duplicate:first-of-type' }, number: 1 },
          { target: { css: '#outside' }, number: 2 },
        ],
      })
    },
  },
  {
    name: 'published',
    async run(flow) {
      await flow.step('open the original', () => flow.goto('/'))
      await flow.shot({ key: 'transaction.kept', title: 'Previously published' })
    },
  },
  {
    name: 'transaction',
    async run(flow) {
      await flow.step('open the replacement', () => flow.goto('/targets'))
      await flow.shot({ key: 'transaction.kept', title: 'Staged replacement' })
      await flow.shot({ key: 'transaction.never', title: 'Never published', annotate: [{ target: { text: 'Same target' }, number: 1 }] })
    },
  },
  {
    name: 'replace-first',
    async run(flow) {
      await flow.step('open the first version', () => flow.goto('/'))
      await flow.shot({ key: 'replacement.same', title: 'First version' })
    },
  },
  {
    name: 'replace-second',
    async run(flow) {
      await flow.step('open the second version', () => flow.goto('/'))
      await flow.shot({ key: 'replacement.same', title: 'Second version' })
    },
  },
]
