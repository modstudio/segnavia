import { execFileSync } from 'node:child_process'
import path from 'node:path'

type Check = (what: string, ok: boolean, detail?: string) => void

function papers(output: string, file: string): string[] {
  return execFileSync('pdftotext', ['-layout', path.join(output, file), '-'], { encoding: 'utf8' })
    .split('\f')
    .filter(Boolean)
}

export function verifyRecordsRender(output: string, check: Check): void {
  const table = papers(output, 'records-table.pdf')
  check('PASS records table has 204 papers', table.length === 204, `papers=${table.length}`)
  check('PASS records table first paper has record and page totals', Boolean(table[0]?.includes('Record 1 of 200') && table[0]?.includes('Page 1 of 1')))
  check(
    'PASS records table first paper has bound record values',
    Boolean(table[0]?.includes('Record name 1') && table[0]?.includes('$1.00') && table[0]?.includes('Short note 1.')),
  )
  const record50 = table.filter((paper) => paper.includes('Record 50 of 200'))
  check(
    'PASS record 50 has two numbered papers',
    record50.length === 2 && Boolean(record50[0]?.includes('Page 1 of 2')) && Boolean(record50[1]?.includes('Page 2 of 2')),
  )
  check('PASS records table last paper is record 200', Boolean(table.at(-1)?.includes('Record 200 of 200')))

  const hebrew = papers(output, 'records-hebrew.pdf')
  const expected = ['עמוד א', 'עמוד ב', 'עמוד א', 'עמוד א', 'עמוד ב', 'עמוד ג']
  check('PASS Hebrew records have a bound Hebrew value', Boolean(hebrew[0]?.includes('מילה1')))
  check('PASS Hebrew records restart per record', hebrew.length === 6 && hebrew.every((paper, index) => paper.includes(expected[index] ?? 'missing')))
  check(
    'PASS Hebrew document numbers run from א to ו',
    hebrew.every((paper, index) => paper.includes(`מסמך ${['א', 'ב', 'ג', 'ד', 'ה', 'ו'][index]}`)),
  )
}
