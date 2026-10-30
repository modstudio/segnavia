export function expectedBookLinkPages(chapterPages: number[], frontPage: number, endnotes: number, frontPages: number): number[] {
  const contentsTextLinks = [frontPage, ...chapterPages.flatMap((page) => Array.from({ length: 7 }, () => page))]
  const contentsNumberLinks = [...contentsTextLinks]
  const footnote = chapterPages[0] ?? 0
  const endnote = chapterPages[2] ?? 0
  const bodyPageReferences = [frontPage, chapterPages[2] ?? 0, chapterPages[2] ?? 0]
  const noteLinks = [footnote, footnote, endnotes, endnote]
  return [...contentsTextLinks, ...contentsNumberLinks, ...bodyPageReferences, ...noteLinks]
    .sort((left, right) => left - right)
    .map((page) => page || frontPages)
}
