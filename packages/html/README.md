# @segnavia/html

`@segnavia/html` turns authored Markdown into safe HTML, sanitizes content, and applies document bindings without requiring a browser. A host uses it when content must be normalized once before the same resolved HTML reaches live, thumbnail, print, or render surfaces.

See the [architecture guide](../../docs/architecture.md) for the full design.

## Entry points

<!-- segnavia:entries -->
| Entry point | Runtime |
|---|---|
| `@segnavia/html` | universal |
<!-- /segnavia:entries -->

## Use one HTML profile on the server and in the editor

Parse the host's profile once at its input edge, then use that same value when
cleaning stored HTML and configuring the browser editor. Content outside the
profile is returned in `dropped` instead of disappearing silently.

```ts
import { cleanHtml, HtmlProfile } from '@segnavia/html'

export const profile = HtmlProfile.parse({
  blocks: { p: true, h: [2], ul: true },
  marks: ['bold', 'italic', 'link'],
  links: { schemes: ['https', 'mailto'] },
  atoms: { pattern: 'double-brace' },
})

const cleaned = cleanHtml(inputHtml, profile)
await saveHtml(cleaned.html)
console.log(cleaned.dropped)
```

```html
<segnavia-html-editor></segnavia-html-editor>
```

```ts
import '@segnavia/html-editor'
import { profile } from './html-profile.ts'

const editor = document.querySelector('segnavia-html-editor')
if (!editor) throw new Error('The HTML editor is missing.')
editor.profile = profile
editor.html = storedHtml
console.log(editor.dropped)
```
