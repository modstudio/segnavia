# @segnavia/html-editor

`@segnavia/html-editor` provides a headless visual editor whose schema and output are limited by an HTML profile.

## Entry points

<!-- segnavia:entries -->
| Entry point | Runtime |
|---|---|
| `@segnavia/html-editor` | browser |
<!-- /segnavia:entries -->

## Use one HTML profile on the server and in the editor

The host parses one profile and uses it both when accepting HTML on the server
and when opening the visual editor in the browser. Read `dropped` after either
step to tell the author what the profile did not admit.

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
