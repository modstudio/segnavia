import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { buildLargeBookPdfs, buildNoteCasePdfs, paginatedFixture } from './build-book-demo.ts'
import { type DemoBookPdf, type DemoBookPlan, replayBook } from './build-book-plan.ts'
import { basicBookFixture } from './demo-book-basic-fixtures.ts'
import { alefCss, designedCss, notoCss } from './demo-book-fonts.ts'
import { keepBookFixture } from './demo-book-keep-fixtures.ts'
import { bookMotifs } from './demo-book-motifs.ts'
import { haggadahHeadCss } from './demo-book-parents.ts'
import { partsFixture } from './demo-book-parts-fixtures.ts'

export async function buildBookPdfs(site: string, bookPdf: DemoBookPdf, bookPlan?: DemoBookPlan): Promise<void> {
  for (const hebrew of [false, true]) {
    const css = hebrew
      ? `${alefCss()}${notoCss()}${designedCss}${haggadahHeadCss}:where(html){font:16px/1.7 Alef,serif}:where([data-pointed]){font-family:NotoSerifHebrew,serif}`
      : `${designedCss}${haggadahHeadCss}:where(html){font:16px/1.5 Georgia,serif}`
    writeFileSync(
      path.join(site, `book-${hebrew ? 'he' : 'en'}.pdf`),
      await bookPdf(
        { ...basicBookFixture(hebrew), page: { paper: 'a5', margin: { blockStart: 16, blockEnd: 16, inlineStart: 18, inlineEnd: 12 } } },
        { motifs: bookMotifs },
      ),
    )
    const paginated = paginatedFixture(hebrew)
    writeFileSync(
      path.join(site, `book-paginated-${hebrew ? 'he' : 'en'}.pdf`),
      hebrew ? await replayBook(paginated, { css, motifs: bookMotifs }, bookPdf, bookPlan) : await bookPdf(paginated, { css, motifs: bookMotifs }),
    )
    writeFileSync(path.join(site, `book-keeps-${hebrew ? 'he' : 'en'}.pdf`), await bookPdf(keepBookFixture(hebrew, 'paginated')))
    writeFileSync(path.join(site, `book-keeps-continuous-${hebrew ? 'he' : 'en'}.pdf`), await bookPdf(keepBookFixture(hebrew, 'continuous')))
    const parts = partsFixture(hebrew)
    writeFileSync(
      path.join(site, `book-parts-${hebrew ? 'he' : 'en'}.pdf`),
      hebrew ? await bookPdf(parts) : await replayBook(parts, undefined, bookPdf, bookPlan),
    )
  }
  await buildLargeBookPdfs(site, (book) => bookPdf(book))
  await buildNoteCasePdfs(site, (book, css) => bookPdf(book, { css }))
}
