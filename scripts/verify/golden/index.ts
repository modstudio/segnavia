import { readFileSync } from 'node:fs'
import path from 'node:path'
import { firstGoldenDifference, goldenFailure } from './compare.ts'
import { GOLDEN_FIXTURES, type GoldenPdf } from './model.ts'
import { readGoldenPdf } from './read.ts'

export async function verifyGoldenPdfs(root: string): Promise<void> {
  for (const fixture of GOLDEN_FIXTURES) {
    const expected = JSON.parse(readFileSync(path.join(root, fixture.golden), 'utf8')) as GoldenPdf
    const actual = await readGoldenPdf(path.join(root, fixture.pdf))
    const difference = firstGoldenDifference(expected, actual)
    if (difference) throw new Error(goldenFailure(fixture.id, difference))
  }
  console.log(`golden PDFs: ${GOLDEN_FIXTURES.length} fixtures match`)
}
