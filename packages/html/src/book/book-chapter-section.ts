import type { BookDivision, Chapter } from '@segnavia/format'
import { bindRecordValues } from '../record-values.ts'
import { parse } from '../sanitize.ts'
import { type BuiltSection, flowAttribs, languageAttribs, recordAttribs, sectionNode } from './book-held.ts'
import type { BookBuild } from './types.ts'

export function chapterSection(chapter: Omit<Chapter, 'title'> & { title?: string }, index: number, division: BookDivision, build: BookBuild): BuiltSection {
  chapter = bindRecordValues(chapter)
  const { id } = chapter
  const document = parse(chapter.html)
  const runningHead = chapter.runningHead ?? chapter.title
  return {
    info: { id, kind: 'chapter', division, title: chapter.title, runningHead, opens: chapter.opens },
    node: sectionNode(
      'chapter',
      id,
      document.children,
      build,
      runningHead,
      flowAttribs(
        chapter.opens,
        chapter.parentRules,
        {
          'data-segnavia-chapter': String(index),
          ...languageAttribs(chapter),
          ...recordAttribs(chapter.record),
        },
        chapter.pageGeometry,
      ),
    ),
  }
}
