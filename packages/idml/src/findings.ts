import type { IdmlModel } from './model.ts'
import type { IdmlTextNode } from './types.ts'

export interface IdmlFindingPage {
  id: string
  name: string
  spread: string
  appliedMaster?: string
  stories: string[]
  paragraphs: { style: string; text: string }[]
}

export interface IdmlPageUse {
  page: string
  count: number
  texts: string[]
}

export interface IdmlFindings {
  pages: IdmlFindingPage[]
  masters: { name: string; pages: string[] }[]
  sections: { name: string; startPage: string; pages: string[] }[]
  paragraphStyles: { name: string; pages: IdmlPageUse[] }[]
}

function paragraphText(node: IdmlTextNode): string {
  return [node.text ?? '', ...node.children.map(paragraphText)].join('').trim()
}

function paragraphs(node: IdmlTextNode | undefined): { style: string; text: string }[] {
  if (!node) return []
  const own =
    node.name === 'ParagraphStyleRange' ? [{ style: node.attributes.AppliedParagraphStyle ?? '$ID/[No paragraph style]', text: paragraphText(node) }] : []
  return [...own, ...node.children.flatMap(paragraphs)]
}

export function idmlFindings(model: IdmlModel): IdmlFindings {
  const masterNames = new Map(model.masterSpreads.map((master) => [master.id, master.name]))
  const pages: IdmlFindingPage[] = model.spreads.flatMap((spread) =>
    spread.pages.map((page) => ({
      id: page.id,
      name: page.name ?? page.id,
      spread: spread.id,
      ...(page.appliedMaster ? { appliedMaster: masterNames.get(page.appliedMaster) ?? page.appliedMaster } : {}),
      stories: [...page.stories],
      paragraphs: [],
    })),
  )
  const masters = model.masterSpreads.map((master) => ({
    name: master.name,
    pages: pages.filter((page) => page.appliedMaster === master.name).map((page) => page.name),
  }))
  const pageIndex = new Map(pages.map((page, index) => [page.id, index]))
  const orderedSections = (model.sections ?? [])
    .map((section) => ({ ...section, index: pageIndex.get(section.pageStart) }))
    .filter((section): section is typeof section & { index: number } => section.index !== undefined)
    .sort((left, right) => left.index - right.index)
  const sections = orderedSections.map((section, index) => ({
    name: section.name,
    startPage: pages[section.index]?.name ?? section.pageStart,
    pages: pages.slice(section.index, orderedSections[index + 1]?.index).map((page) => page.name),
  }))
  const styleNames = new Map((model.styles ?? []).filter((style) => style.kind === 'paragraph').map((style) => [style.id, style.name]))
  const storyParagraphs = new Map(model.stories.map((story) => [story.id, paragraphs(story.root)]))
  for (const page of pages)
    page.paragraphs = page.stories
      .flatMap((story) => storyParagraphs.get(story) ?? [])
      .map((paragraph) => ({ ...paragraph, style: styleNames.get(paragraph.style) ?? paragraph.style }))
  const styleUses = new Map<string, Map<string, { count: number; texts: string[] }>>()
  for (const page of pages) {
    for (const paragraph of page.stories.flatMap((story) => storyParagraphs.get(story) ?? [])) {
      const pageUses = styleUses.get(paragraph.style) ?? new Map()
      const use = pageUses.get(page.name) ?? { count: 0, texts: [] }
      use.count += 1
      if (paragraph.text) use.texts.push(paragraph.text)
      pageUses.set(page.name, use)
      styleUses.set(paragraph.style, pageUses)
    }
  }
  const paragraphStyles = [...styleUses].map(([id, pageUses]) => ({
    name: styleNames.get(id) ?? id,
    pages: [...pageUses].map(([page, use]) => ({ page, ...use })),
  }))
  return { pages, masters, sections, paragraphStyles }
}
