import { execFileSync } from 'node:child_process'
import path from 'node:path'

type Check = (what: string, ok: boolean, detail?: string) => void

export function verifySectionedRender(output: string, check: Check): void {
  const sectioned = execFileSync('pdftotext', ['-layout', path.join(output, 'pages-sectioned.pdf'), '-'], { encoding: 'utf8' })
    .split('\f')
    .filter(Boolean)
  check(
    'a sectioned printed document has an uncounted cover and two numbered body papers',
    sectioned.length === 3 &&
      sectioned[0]?.includes('SECTIONED COVER') === true &&
      sectioned[0]?.includes('Page') === false &&
      sectioned[0]?.includes('of') === false &&
      sectioned[1]?.includes('Page 1 of 2') === true &&
      sectioned[2]?.includes('Page 2 of 2') === true,
    sectioned.map((text, index) => `${index + 1}:${text.replace(/\s+/g, ' ').trim()}`).join(' | '),
  )
  const pagePdf = execFileSync('pdfinfo', [path.join(output, 'pages-sectioned.pdf')], { encoding: 'utf8' })
  const pagesPdf = execFileSync('pdfinfo', [path.join(output, 'pages-sectioned-multi.pdf')], { encoding: 'utf8' })
  check('pagesPdf prints the sectioned fixture with the same paper count as pagePdf', /Pages:\s+3\b/.test(pagePdf) && /Pages:\s+3\b/.test(pagesPdf))
}
