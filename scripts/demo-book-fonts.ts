import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dir, '..')

export const BOOK_STYLE_CHECK_CSS = '.book-css-check{color:rgb(91, 42, 123);font-size:23px}'
export const BOOK_CSS = `html{font:18px/1.55 Georgia,serif;scroll-behavior:auto}body{margin:0}.segnavia-section{box-sizing:border-box;min-block-size:520px;padding:24px 32px}.segnavia-contents{background:#f3efe4}.segnavia-chapter:nth-of-type(even){background:#edf4f6}.note-paragraph{min-block-size:360px}.segnavia-footnotes{border-block-start:1px solid;padding-block-start:12px}.segnavia-endnotes{background:#f6f0f4}h1{margin-block-start:0}a{color:#174f72}${BOOK_STYLE_CHECK_CSS}`
export const designedCss =
  ':where(.designed-spread,.designed-leaf){box-sizing:border-box;inline-size:100%;block-size:100%;padding-block:24px;padding-inline:24px}:where(.designed-verso){background:#1a365d;color:#fff}:where(.designed-recto){background:#2c5282;color:#fff}:where(.designed-leaf){background:#edf2f7}:where(.designed-foot){text-align:center}:where(table){inline-size:100%;border-collapse:collapse}:where(th,td){border:1px solid;padding:4px}'
export const haggadahHeadCss =
  ':where(.haggadah-head){position:relative;block-size:100%;display:flex;align-items:center;justify-content:center}:where(.haggadah-siman){position:absolute}:where(.haggadah-siman-start){inset-inline-start:0}:where(.haggadah-siman-end){inset-inline-end:0}'
export const workbookCss =
  ':where(.lesson){box-sizing:border-box;inline-size:100%;block-size:100%;padding-block:12px;padding-inline:12px;display:flex;flex-direction:column;gap:8px}:where(.lesson-heading){font-weight:700}:where(.lesson-reading){flex:none;block-size:3em;max-block-size:3em;overflow:visible}:where(.lesson-table table){inline-size:100%;border-collapse:collapse}:where(.lesson-table th,.lesson-table td){border:1px solid;padding:4px}:where(.copyright-page){box-sizing:border-box;inline-size:100%;block-size:100%;padding:24px}:where(.lesson-alt .lesson-table){order:-1}'

export const alefCss = () => {
  const data = readFileSync(path.join(ROOT, 'fixtures/hebrew-notice/Alef-Regular.ttf')).toString('base64')
  return `@font-face{font-family:Alef;src:url(data:font/ttf;base64,${data}) format('truetype');font-display:block}`
}

export const notoCss = () => {
  const data = readFileSync(path.join(ROOT, 'fixtures/hebrew-notice/NotoSerifHebrew-Regular.ttf')).toString('base64')
  return `@font-face{font-family:NotoSerifHebrew;src:url(data:font/ttf;base64,${data}) format('truetype');font-display:block}`
}
