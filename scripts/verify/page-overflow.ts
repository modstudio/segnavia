import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Renderer } from '@segnavia/render'
import { pageContentScale } from './pdf-content.ts'

export async function verifyPageOverflow(renderer: Renderer, work: string, check: (what: string, ok: boolean, detail?: string) => void): Promise<void> {
  const overflowing = await renderer.pagePdf(
    {
      html: '<style>html,body{margin:0}.overflow{position:absolute;left:360px;top:80px;width:100px;height:100px;background:black;transform:rotate(20deg)}</style><div class="overflow"></div>',
      size: { width: 400, height: 300 },
    },
    { effects: false },
  )
  const overflowScale = await pageContentScale(overflowing)
  check(
    'a fixed page with sideways overflow prints at its own scale',
    Math.abs(overflowScale - 3.125) < 0.000001,
    `cm=${overflowScale}, scale=${overflowScale * 0.24}pt/CSS px`,
  )

  const repeatedFixed = await renderer.pagePdf(
    {
      html: '<style>body{margin:0}.fixed{position:fixed;top:20px;left:20px}.long{height:40in}</style><div class="fixed">FIXED_ON_EVERY_PAGE</div><div class="long"></div>',
      print: { paper: 'letter', orientation: 'portrait' },
    },
    { effects: false },
  )
  const repeatedFixedFile = path.join(work, 'repeated-fixed.pdf')
  writeFileSync(repeatedFixedFile, repeatedFixed)
  const repeatedFixedPages = Number(execFileSync('pdfinfo', [repeatedFixedFile], { encoding: 'utf8' }).match(/Pages:\s+(\d+)/)?.[1])
  const repeatedFixedText = execFileSync('pdftotext', [repeatedFixedFile, '-'], { encoding: 'utf8' })
  const repeatedFixedCount = repeatedFixedText.match(/FIXED_ON_EVERY_PAGE/g)?.length ?? 0
  check(
    'a fixed element repeats on every page of a multi-page print',
    repeatedFixedPages >= 3 && repeatedFixedCount === repeatedFixedPages,
    `fixed=${repeatedFixedCount}, pages=${repeatedFixedPages}`,
  )
}
