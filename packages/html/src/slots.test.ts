import { expect, test } from 'bun:test'
import type { SlotDeclaration, SlotReport } from '@segnavia/format'
import qrcode from 'qrcode-generator'
import {
  hasSlotWork,
  MAX_SLOT_DECLARATIONS,
  prepareSlotCollection,
  prepareSlots,
  RequiredSlotsRefusedError,
  requiredSlotRefusal,
  SlotFillRefusedError,
  slotFillRefusal,
} from './slots.ts'

const declarations: SlotDeclaration[] = [
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'role', label: 'Role', type: 'text', required: false, placeholder: 'Role preview' },
  { key: 'email', label: 'Email', type: 'email', required: false },
  { key: 'site', label: 'Website', type: 'link', required: false },
  { key: 'logo', label: 'Logo', type: 'image', required: false },
]

test('slot fill policy refuses only fills with declarations for an item that runs scripts', () => {
  const options = { fill: { id: 'x', values: {} } }
  const refusal = slotFillRefusal('sandboxed', declarations, options)
  expect(refusal).toBeInstanceOf(SlotFillRefusedError)
  expect(refusal?.message).toContain("scripts: 'sandboxed'")
  expect(slotFillRefusal('refuse', declarations, options)).toBeUndefined()
  expect(slotFillRefusal('sandboxed', declarations, undefined)).toBeUndefined()
  expect(slotFillRefusal('sandboxed', undefined, options)).toBeUndefined()
  expect(slotFillRefusal('sandboxed', undefined, { ...options, declarations })).toBeInstanceOf(SlotFillRefusedError)
})

test('slot work includes every reason preparation must run', () => {
  expect(hasSlotWork(undefined, undefined)).toBe(false)
  expect(hasSlotWork(declarations, undefined)).toBe(true)
  expect(hasSlotWork(undefined, { declarations })).toBe(true)
  expect(hasSlotWork(undefined, { fill: { id: 'x', values: {} } })).toBe(true)
  expect(hasSlotWork(undefined, { resolveAsset: async () => 'data:image/png;base64,AAAA' })).toBe(true)
  expect(hasSlotWork(undefined, { report() {} })).toBe(true)
})

test('slot filling resolves assets, preserves designs, escapes markup and reports every state', async () => {
  let report: SlotReport | undefined
  const prepared = await prepareSlots(declarations, {
    fill: { id: 'ada', values: { name: '<b>Ada</b>', email: 'not-an-email', site: 'https://example.com/ada', logo: { asset: 'logos/ada' } } },
    resolveAsset: async () => 'data:image/png;base64,AAAA',
    report: (value) => {
      report = value
    },
  })
  const html = prepared.apply(
    '<p data-slot-value="name">Design name</p><p data-slot-value="role">Design role</p><a data-slot-href="site">Site</a><img data-slot-src="logo"><i data-slot-value="missing">Design text</i>',
  )
  expect(html).toContain('&lt;b&gt;Ada&lt;/b&gt;')
  expect(html).not.toContain('<b>Ada</b>')
  expect(html).toContain('Role preview')
  expect(html).toContain('href="https://example.com/ada"')
  expect(html).toContain('src="data:image/png;base64,AAAA"')
  expect(html).toContain('Design text')
  expect(report).toEqual({ fill: 'ada', slots: { name: 'filled', role: 'placeholder', email: 'invalid', site: 'filled', logo: 'filled' } })
})

test('slot application changes only bound elements and keeps authored active and remote content', async () => {
  const source =
    '<!doctype html>\n<script>window.authored = true</script>\n<link rel="stylesheet" href="https://styles.example/site.css">\n<img src="https://images.example/photo.jpg">\n<a href="https://other.example/original">Original</a>\n<p data-slot-value="name">Design</p>'
  const prepared = await prepareSlots([declarations[0] as SlotDeclaration], { fill: { id: 'x', values: { name: '<img src=x onerror=evil()>' } } })
  const html = prepared.apply(source)
  expect(html).toStartWith(source.slice(0, source.indexOf('<p')))
  expect(html).toContain('&lt;img src=x onerror=evil()&gt;')
  expect(html).not.toContain('<img src=x onerror=evil()>')
})

test('value bindings in every unencoded-text element are refused and cannot create siblings', async () => {
  const tags = ['style', 'script', 'xmp', 'iframe', 'noembed', 'noframes', 'plaintext', 'noscript', 'textarea', 'title']
  for (const tag of tags) {
    const reports: SlotReport[] = []
    const prepared = await prepareSlots([declarations[0] as SlotDeclaration], {
      fill: { id: 'x', values: { name: `</${tag}><img src=x onerror=evil()>` } },
      report: (report) => reports.push(structuredClone(report)),
    })
    expect(() => prepared.apply(`<${tag} data-slot-value="name">Authored</${tag}>`)).toThrow(`Slot "name" uses a value binding on <${tag}>`)
    expect(reports.at(-1)?.slots.name).toBe('invalid')
  }
})

test('src bindings outside image elements are refused', async () => {
  const prepared = await prepareSlots([{ key: 'logo', label: 'Logo', type: 'image', required: false }], {
    fill: { id: 'x', values: { logo: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>' } },
  })
  for (const tag of ['iframe', 'source']) {
    expect(() => prepared.apply(`<${tag} data-slot-src="logo"></${tag}>`)).toThrow(
      `Slot "logo" uses a src binding on <${tag}>; src bindings are allowed only on <img>.`,
    )
  }
})

test('an invalid URL replacement is inert and leaves the authored URL in place', async () => {
  const prepared = await prepareSlots([{ key: 'site', label: 'Site', type: 'link', required: false }], {
    fill: { id: 'x', values: { site: 'javascript:evil()' } },
  })
  const html = prepared.apply('<a data-slot-href="site" href="https://author.example/path">Site</a>')
  expect(html).toContain('href="https://author.example/path"')
  expect(html).not.toContain('javascript:')
})

test('asset resolution is deduplicated and limited to four concurrent calls', async () => {
  let active = 0
  let peak = 0
  let calls = 0
  const assets = Array.from({ length: 8 }, (_, index) => ({ key: `image${index}`, label: `Image ${index}`, type: 'image' as const, required: false }))
  await prepareSlots(assets, {
    fill: { id: 'x', values: Object.fromEntries(assets.map((slot, index) => [slot.key, { asset: `asset-${Math.floor(index / 2)}` }])) },
    resolveAsset: async () => {
      calls++
      active++
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 1))
      active--
      return 'data:image/png;base64,AAAA'
    },
  })
  expect(calls).toBe(4)
  expect(peak).toBeLessThanOrEqual(4)
})

test('collections merge host and item declarations once and cap each item', async () => {
  const prepared = await prepareSlotCollection([[declarations[0] as SlotDeclaration], [declarations[0] as SlotDeclaration]], {
    declarations: [{ key: 'role', label: 'Role', type: 'text', required: false }],
    fill: { id: 'x', values: { name: 'Ada', role: 'Engineer' } },
  })
  expect(prepared.apply('<p data-slot-value="name">Name</p><p data-slot-value="role">Role</p>')).toContain('Engineer')
  const tooMany = Array.from({ length: MAX_SLOT_DECLARATIONS + 1 }, (_, index) => ({
    key: `slot${index}`,
    label: `Slot ${index}`,
    type: 'text' as const,
    required: false,
  }))
  expect(prepareSlotCollection([tooMany], {})).rejects.toThrow(`declares ${MAX_SLOT_DECLARATIONS + 1} slots; the limit is ${MAX_SLOT_DECLARATIONS}`)
})

test('items without slot declarations pass through byte for byte', async () => {
  const html = '<script>window.authored = true</script><p>Original</p>'
  expect((await prepareSlots([], {})).apply(html)).toBe(html)
})

test('QR values render the level M module matrix with a four-module quiet zone and CSS colour', async () => {
  const link = 'https://example.com/path?a=1&b="two"'
  const prepared = await prepareSlots([{ key: 'code', label: 'Code', type: 'qr', required: false }], {
    fill: { id: 'x', values: { code: link } },
  })
  const html = prepared.apply('<div data-slot-value="code">Authored fallback</div>')
  const expected = qrcode(0, 'M')
  expected.addData(link)
  expected.make()
  const modules = expected.getModuleCount()
  expect(html).toContain(`<svg viewBox="0 0 ${modules + 8} ${modules + 8}" shape-rendering="crispEdges" role="img"`)
  expect(html).toContain('aria-label="https://example.com/path?a=1&amp;b=&quot;two&quot;"')
  expect(html).not.toContain('Authored fallback')
  const rectangles = [...html.matchAll(/<rect x="(\d+)" y="(\d+)" width="1" height="1" fill="currentColor"\/>/g)].map(([, x, y]) => [Number(x), Number(y)])
  const expectedDark: number[][] = []
  for (let row = 0; row < modules; row++) {
    for (let column = 0; column < modules; column++) if (expected.isDark(row, column)) expectedDark.push([column + 4, row + 4])
  }
  expect(rectangles).toEqual(expectedDark)
})

test('invalid QR links report invalid and keep authored content', async () => {
  const prepared = await prepareSlots([{ key: 'code', label: 'Code', type: 'qr', required: false }], {
    fill: { id: 'x', values: { code: 'javascript:alert(1)' } },
  })
  expect(prepared.report.slots.code).toBe('invalid')
  expect(prepared.apply('<div data-slot-value="code">Authored fallback</div>')).toContain('Authored fallback')
})

test('required-slot policy lists every unfilled key and state', () => {
  const required = declarations.slice(0, 3).map((slot) => ({ ...slot, required: true }))
  const refusal = requiredSlotRefusal(required, {
    fill: 'x',
    slots: { name: 'placeholder', role: 'unavailable', email: 'invalid' },
  })
  expect(refusal).toBeInstanceOf(RequiredSlotsRefusedError)
  expect(refusal?.message).toContain('"name" (placeholder), "role" (unavailable), "email" (invalid)')
  expect(refusal?.message).toContain('Fill those slots, or mark them optional')
  expect(requiredSlotRefusal(required, { fill: 'x', slots: { name: 'filled', role: 'filled', email: 'filled' } })).toBeUndefined()
})

test('present removes an optional slot element a fill leaves empty, so its layout item collapses', async () => {
  const role = [{ key: 'role', label: 'Role', type: 'text', required: false }] as const
  const html = '<div class="grid"><p>Kept</p><p data-slot-present="role" data-slot-value="role">Role</p></div>'
  const filled = await prepareSlots([...role], { fill: { id: 'mina', values: {} } })
  expect(filled.apply(html)).toBe('<div class="grid"><p>Kept</p></div>')
  const unfilled = await prepareSlots([...role])
  expect(unfilled.apply(html)).toBe('<div class="grid"><p>Kept</p><p>Role</p></div>')
})

test('preparation keeps required items viewable when their slots are unfilled', async () => {
  const prepared = await prepareSlots([{ key: 'name', label: 'Name', type: 'text', required: true }])
  expect(prepared.report.slots.name).toBe('unavailable')
  expect(prepared.apply('<p data-slot-value="name">Design name</p>')).toContain('Design name')
})
