import './source-guard.ts'
import type { DocumentInput } from '@segnavia/format'
import { markdownHtml } from '@segnavia/html'

const worksheetTasks = '- [x] Read the directions\n- [ ] Check the answer'

export const worksheetHtml = `<!doctype html><html><body style="font:16px sans-serif;line-height:1.5"><section lang="en"><h1>Field worksheet</h1><p>Name: <span data-segnavia-field="line"></span></p><figure><span data-segnavia-field="line"></span><figcaption>Figure answer</figcaption></figure><p>Code: <span data-segnavia-field="line" data-segnavia-field-length="10ch">ALPHA</span></p><p><span data-segnavia-field="checkbox" role="img" aria-label="unchecked"></span> Optional <span data-segnavia-field="checkbox" data-segnavia-field-checked role="img" aria-label="checked"></span> Complete</p><div data-segnavia-field="box" data-segnavia-field-lines="3" data-segnavia-field-rule="ruled">Written answer</div><div data-segnavia-field="box" data-segnavia-field-lines="2" data-segnavia-field-rule="plain"></div>${markdownHtml(worksheetTasks)}</section><section lang="he" dir="rtl"><h2>דף עבודה</h2><p>שם: <span data-segnavia-field="line"></span></p><p>קוד: <span data-segnavia-field="line" data-segnavia-field-length="8em">תשובה</span></p><p><span data-segnavia-field="checkbox" role="img" aria-label="unchecked"></span> לא נבדק <span data-segnavia-field="checkbox" data-segnavia-field-checked role="img" aria-label="checked"></span> נבדק</p><div data-segnavia-field="box" data-segnavia-field-lines="2" data-segnavia-field-rule="ruled">תשובה מלאה</div><div data-segnavia-field="box" data-segnavia-field-lines="2" data-segnavia-field-rule="plain"></div></section></body></html>`

export const worksheetPage: DocumentInput = {
  type: 'document',
  kind: 'page',
  size: 'fluid',
  print: { paper: 'letter', orientation: 'portrait', margin: { blockStart: 15, blockEnd: 15, inlineStart: 15, inlineEnd: 15 } },
  children: [{ type: 'page', body: { html: worksheetHtml } }],
}
