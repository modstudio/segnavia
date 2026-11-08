import { Direction, htmlTextSample, resolveDirection, type TextDirection } from './direction.ts'

const HTML_ROOT = /<html(?:\s[^>]*)?>/i
const ROOT_DIRECTION = /\sdir\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i

function rootDirection(html: string): Direction | undefined {
  const root = HTML_ROOT.exec(html)?.[0]
  const value =
    root &&
    ROOT_DIRECTION.exec(root)
      ?.slice(1)
      .find((part) => part !== undefined)
  return value && Direction.safeParse(value.toLowerCase()).success ? (value.toLowerCase() as Direction) : undefined
}

/** Resolves a page from its authored root dir, page dir, language, visible text, then an ltr fallback. */
export function pageDirection(page: { dir?: Direction; lang?: string; html: string }): TextDirection {
  return resolveDirection(rootDirection(page.html) ?? page.dir, page.lang, htmlTextSample(page.html))
}
