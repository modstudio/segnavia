import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dir, '..')

export const alefCss = () => {
  const data = readFileSync(path.join(ROOT, 'fixtures/hebrew-notice/Alef-Regular.ttf')).toString('base64')
  return `@font-face{font-family:Alef;src:url(data:font/ttf;base64,${data}) format('truetype');font-display:block}`
}

export const notoCss = () => {
  const data = readFileSync(path.join(ROOT, 'fixtures/hebrew-notice/NotoSerifHebrew-Regular.ttf')).toString('base64')
  return `@font-face{font-family:NotoSerifHebrew;src:url(data:font/ttf;base64,${data}) format('truetype');font-display:block}`
}
