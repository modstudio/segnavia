import type { DocumentInput } from '@segnavia/format'

export const fluidPage: DocumentInput = {
  type: 'document',
  kind: 'page',
  size: 'fluid',
  children: [
    {
      type: 'page',
      body: {
        html:
          '<!doctype html><html><body style="margin:0;font-family:system-ui,sans-serif"><header style="padding:48px;background:#0f766e;color:#fff"><h1 style="margin:0">A page for the web</h1></header><main style="padding:48px;max-width:720px">' +
          "<p>Pages have no paper. This one is fluid: it renders at the viewer's width and as tall as its content.</p>".repeat(12) +
          '</main><script>document.body.style.background = "red"</script></body></html>',
      },
    },
  ],
}

export const hebrewPage: DocumentInput = {
  type: 'document',
  kind: 'page',
  size: { width: 600, height: 'auto' },
  settings: { dir: 'rtl', lang: 'he' },
  children: [{ type: 'page', body: { html: '<h1 style="font-family:sans-serif">שלום</h1><p>A page set right to left.</p>' } }],
}

export const markdownPage: DocumentInput = {
  type: 'document',
  kind: 'page',
  size: { width: 420, height: 'auto' },
  settings: { lang: 'he' },
  children: [
    {
      type: 'page',
      body: {
        markdown: `---
title: דוגמת Markdown
published: true
---

# עברית and English

English opens this mixed line שלום.

עברית פותחת את השורה mixed English.

> [!NOTE]
> This alert follows the page language.

- [x] משימה שהושלמה
- [ ] Task still open

\`\`\`mermaid
flowchart LR
  start[התחלה] --> finish[Finished]
\`\`\`

| Column | A very wide English and Hebrew value |
| --- | --- |
| One | This table is deliberately wider than the page שלום שלום שלום שלום שלום שלום שלום שלום שלום שלום שלום שלום שלום שלום שלום שלום |`,
      },
    },
  ],
}

export const ownDirectionPage: DocumentInput = {
  type: 'document',
  kind: 'page',
  size: { width: 600, height: 'auto' },
  settings: { dir: 'rtl', lang: 'he' },
  children: [{ type: 'page', body: { html: '<p dir="ltr">שלום This sentence stays left to right.</p>' } }],
}

export const emptyDirectionPage: DocumentInput = {
  type: 'document',
  kind: 'page',
  size: { width: 600, height: 'auto' },
  settings: { dir: 'rtl', lang: 'he' },
  children: [{ type: 'page', body: { html: '<p dir="">שלום This sentence follows its first letter.</p>' } }],
}

export const rightToLeftDivPage: DocumentInput = {
  type: 'document',
  kind: 'page',
  size: { width: 600, height: 'auto' },
  settings: { dir: 'rtl', lang: 'he' },
  children: [
    {
      type: 'page',
      body: {
        html: [
          '<div>English text directly in a div.</div>',
          '<section>English text directly in a section.</section>',
          '<article>English text directly in an article.</article>',
          '<aside>English text directly in an aside.</aside>',
          '<address>English text directly in an address.</address>',
        ].join(''),
      },
    },
  ],
}
