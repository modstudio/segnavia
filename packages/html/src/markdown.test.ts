import { describe, expect, test } from 'bun:test'
import { Page } from '@segnavia/format'
import {
  bodyHtml,
  isGithubAlertBlock,
  markdownHtml,
  markdownOutline,
  printedSectionBodies,
  resolvePageHtml,
  resolvePrintedPageHtml,
  withPrintedSectionBodies,
} from './markdown.ts'
import { findActiveContent } from './sanitize.ts'

describe('bodyHtml', () => {
  test('passes HTML through unchanged', () => {
    expect(bodyHtml({ html: '<p>unchanged</p>' })).toBe('<p>unchanged</p>')
  })

  test('converts a body only once for the same options', () => {
    let labelReads = 0
    const alertLabels = {} as { note: string }
    Object.defineProperty(alertLabels, 'note', {
      enumerable: true,
      get: () => {
        labelReads++
        return 'Memoized'
      },
    })
    const body = { markdown: '> [!NOTE]\n> Read.' } as const
    const options = { alertLabels }
    expect(bodyHtml(body, options)).toContain('<bdi>Memoized</bdi>')
    const afterConversion = labelReads
    expect(bodyHtml(body, options)).toContain('<bdi>Memoized</bdi>')
    expect(labelReads - afterConversion).toBe(1)
  })

  test('shares one conversion between body HTML and its outline', () => {
    let reads = 0
    const body = {} as { markdown: string }
    Object.defineProperty(body, 'markdown', {
      enumerable: true,
      get: () => {
        reads++
        return '# Shared pass'
      },
    })
    expect(bodyHtml(body, { dir: 'rtl', lang: 'he' })).toContain('id="shared-pass"')
    const afterHtml = reads
    expect(markdownOutline(body)).toEqual([{ id: 'shared-pass', level: 1, title: 'Shared pass' }])
    expect(reads).toBe(afterHtml)
  })

  test('emits GFM tables, tasks, strikethrough and autolinks', () => {
    const html = bodyHtml({ markdown: '| A | B |\n| - | - |\n| 1 | 2 |\n\n- [x] done\n\n~~gone~~ <https://example.test>' })
    expect(html).toContain('<div data-segnavia-overflow><table>')
    expect(html).toContain(
      '<li class="task-list-item"><span data-segnavia-field="checkbox" data-segnavia-field-checked role="img" aria-label="checked"></span> done</li>',
    )
    expect(html).not.toContain('<input')
    expect(html).toContain('<del>gone</del>')
    expect(html).toContain('href="https://example.test"')
  })

  test('renders checked and unchecked task items as print-safe checkbox fields', () => {
    const html = bodyHtml({ markdown: '- [ ] open\n- [x] complete' })
    expect(html).toContain('<span data-segnavia-field="checkbox" role="img" aria-label="unchecked"></span> open')
    expect(html).toContain('<span data-segnavia-field="checkbox" data-segnavia-field-checked role="img" aria-label="checked"></span> complete')
    expect(html).not.toContain('<input')
  })

  test('renders readable, cyclic and unreadable frontmatter without an hr', () => {
    const readable = bodyHtml({ markdown: '---\nenabled: true\nnested:\n  values: &values [one, *values]\n---\nText' })
    expect(readable).toContain('<dl data-segnavia-frontmatter>')
    expect(readable).toContain('<dt>enabled</dt><dd>yes</dd>')
    expect(readable).toContain('(cycle)')
    expect(readable).not.toContain('<hr>')
    const unreadable = bodyHtml({ markdown: '---\n[broken\n---' })
    expect(unreadable).toContain('Frontmatter could not be read.')
    expect(unreadable).toContain('[broken')
  })

  test('renders container directives and leaves inline and leaf directives literal', () => {
    const html = bodyHtml({ markdown: ':::panel{kind="aside"}\nInside\n:::\n\nTime 16:41 :mark[kept]\n\n::leaf[value]' })
    expect(html).toContain('<div data-segnavia-directive="panel" data-segnavia-directive-kind="aside">')
    expect(html).toContain(':mark[kept]')
    expect(html).toContain('::leaf[value]')
    expect(html).toContain('16:41')
  })

  test('renders alerts with an isolated language label', () => {
    expect(bodyHtml({ markdown: '> [!NOTE]\n> Read this.' })).toMatch(/<div data-segnavia-alert="note">\s*<bdi>Note<\/bdi>/)
    expect(bodyHtml({ markdown: '> [!WARNING]\n> קראו.' }, { lang: 'he' })).toContain('<bdi>אזהרה</bdi>')
    expect(bodyHtml({ markdown: '> [!TIP]\n> Read.' }, { alertLabels: { tip: 'Hint' } })).toContain('<bdi>Hint</bdi>')
    expect(bodyHtml({ markdown: '> [!NOTE]\n> Read.' }, { lang: 'en', dir: 'rtl' })).toContain('<bdi>Note</bdi>')
    expect(bodyHtml({ markdown: '> [!NOTE]\n> קראו.' })).toContain('<bdi>הערה</bdi>')
  })

  test('uses the converter alert rule after a bare blockquote line', () => {
    const markdown = '>\n> [!NOTE]\n> Read this.'
    expect(isGithubAlertBlock(markdown)).toBe(true)
    expect(bodyHtml({ markdown })).toContain('data-segnavia-alert="note"')
  })

  test('marks mermaid and wraps other fences as overflow', () => {
    const html = bodyHtml({ markdown: '```mermaid\ngraph TD\n```\n\n```txt\nwide\n```' })
    expect(html).toContain('<pre data-segnavia-diagram="mermaid"><code class="language-mermaid">graph TD')
    expect(html).toContain('<div data-segnavia-overflow><pre><code class="language-txt">wide')
  })

  test('does not render raw HTML and sanitizes markdown URLs', () => {
    const html = bodyHtml({
      markdown:
        '<img src="https://images.test/a.png" onerror="alert(1)">\n\n[bad](javascript:alert(1)) [web](https://example.test) [mail](mailto:a@example.test) ![remote](https://images.test/a.png)',
    })
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('href="https://example.test"')
    expect(html).toContain('href="mailto:a@example.test"')
    expect(html).not.toContain('src="https://images.test/a.png"')
  })

  test('keeps converted images only at approved image origins', () => {
    const approved = 'https://images.example/approved.png'
    const refused = 'https://outside.example/refused.png'
    const options = { origins: [{ origin: 'https://images.example', kinds: ['image'] as const }] }
    const html = bodyHtml({ markdown: `![approved](${approved}) ![refused](${refused})` }, options)
    expect(html).toContain(`src="${approved}"`)
    expect(html).not.toContain(`src="${refused}"`)
    expect(findActiveContent(`<img src="${refused}">`, options)).toEqual([expect.stringContaining('origin https://outside.example')] as string[])
  })

  test('memoizes converted images by every iterable origin policy', () => {
    const source = '![asset](https://images.example/asset.png)'
    const approval = { origin: 'https://images.example', kinds: ['image'] as const }
    const approvedFirst = { markdown: source }
    expect(markdownHtml(approvedFirst, { origins: new Set([approval]) })).toContain('src="https://images.example/asset.png"')
    expect(markdownHtml(approvedFirst, { origins: new Set() })).not.toContain('src="https://images.example/asset.png"')

    const refusedFirst = { markdown: source }
    expect(markdownHtml(refusedFirst, { origins: new Set() })).not.toContain('src="https://images.example/asset.png"')
    expect(markdownHtml(refusedFirst, { origins: new Set([approval]) })).toContain('src="https://images.example/asset.png"')

    const approvals = function* () {
      yield approval
    }
    expect(markdownHtml({ markdown: source }, { origins: approvals() })).toContain('src="https://images.example/asset.png"')
  })

  test('adds only logical geometry for overflow on screen and print', () => {
    const html = bodyHtml({ markdown: '| A |\n| - |\n| B |' })
    expect(html).toContain(':where([data-segnavia-overflow]){max-inline-size:100%;overflow-x:auto}')
    expect(html).toContain('@media print')
    expect(html).toContain('white-space:pre-wrap')
    expect(html).not.toMatch(/\b(left|right|width|height):/)
  })
})

test('markdownOutline lowercases headings independently of the host locale', () => {
  expect(markdownOutline('# Istanbul')).toEqual([{ id: 'istanbul', level: 1, title: 'Istanbul' }])
})

test('resolvePageHtml lowers markdown with page options and prefers stored HTML', () => {
  const remoteImage = Page.parse({ markdown: '![a](https://images.example/a.png)' })
  expect(resolvePageHtml(Page.parse({ markdown: '> [!NOTE]\n> שלום', dir: 'rtl', lang: 'he' })).html).toContain('<bdi>הערה</bdi>')
  expect(resolvePageHtml(Page.parse({ markdown: '> [!NOTE]\n> Read', dir: 'rtl' })).html).toContain('<bdi>הערה</bdi>')
  expect(resolvePageHtml(Page.parse({ markdown: '> [!NOTE]\n> Read' }), { alertLabels: { note: 'Memo' } }).html).toContain('<bdi>Memo</bdi>')
  expect(resolvePageHtml(remoteImage, { origins: [{ origin: 'https://images.example', kinds: ['image'] }] }).html).toContain(
    'src="https://images.example/a.png"',
  )
  expect(resolvePageHtml(remoteImage).html).not.toContain('src="https://images.example/a.png"')
  expect(resolvePageHtml(Page.parse({ html: '<h1>Heading</h1>' })).html).toBe('<h1>Heading</h1>')
  expect(resolvePageHtml(Page.parse({ body: { html: '<h1>Stored</h1>', markdown: '# Source' } })).html).toBe('<h1>Stored</h1>')
})

test('resolvePrintedPageHtml keeps the stored-HTML requirement for an implicit body', () => {
  const page = Page.parse({
    markdown: '# Heading',
    print: { paper: 'letter' },
    printedPages: { parents: [{ name: 'body', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } }], parentRules: [{ parent: 'body' }] },
  })
  expect(() => resolvePrintedPageHtml(page)).toThrow('pass its Document input through @segnavia/html parseDocument')
})

test('printed section bodies round trip through flowing and designed section shapes', () => {
  const sections = resolvePrintedPageHtml(
    Page.parse({
      print: { paper: 'letter' },
      printedPages: {
        parents: [{ name: 'body', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } }],
        parentRules: [{ parent: 'body' }],
        sections: [
          { id: 'flow', html: '<p>Flow</p>' },
          { id: 'designed', pages: [{ html: '<p>One</p>' }, { html: '<p>Two</p>' }] },
        ],
      },
    }),
  ).printedPages.sections

  expect(sections.map(printedSectionBodies)).toEqual([['<p>Flow</p>'], ['<p>One</p>', '<p>Two</p>']])
  expect(sections.map((section) => withPrintedSectionBodies(section, printedSectionBodies(section)))).toEqual(sections)
})

test('markdownOutline preserves Hebrew and suffixes duplicate headings at every level', () => {
  expect(markdownOutline('---\ntitle: "# skipped"\n---\n# שלום עולם\n## שלום עולם\n```md\n# skipped\n```\n### English')).toEqual([
    { id: 'שלום-עולם', level: 1, title: 'שלום עולם' },
    { id: 'שלום-עולם-2', level: 2, title: 'שלום עולם' },
    { id: 'english', level: 3, title: 'English' },
  ])
})
