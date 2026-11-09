import type { BookOpens, BookSectionParents } from './book-section.ts'
import type { SectionNumbering } from './folio.ts'
import type { ResolvedBookPageGeometry } from './book-page-geometry.ts'
import { sameBookPageGeometry } from './book-page-geometry.ts'

export interface SectionOpensFact {
  id: string
  title?: string
  path: (string | number)[]
  sequence: string
  flowing: boolean
  opens?: BookOpens
  numbering?: SectionNumbering
  parents?: BookSectionParents
  pageGeometry?: string
  geometry?: ResolvedBookPageGeometry
}

export interface SectionOpensIssue {
  path: (string | number)[]
  message: string
}

function label(section: SectionOpensFact): string {
  return section.title ?? section.id
}

export function sectionOpensIssues(sections: readonly SectionOpensFact[]): SectionOpensIssue[] {
  const previous = new Map<string, SectionOpensFact>()
  const issues: SectionOpensIssue[] = []
  for (const section of sections) {
    const before = previous.get(section.sequence)
    previous.set(section.sequence, section)
    if (section.opens !== 'continue') continue
    const name = label(section)
    if (!before) {
      issues.push({
        path: [...section.path, 'opens'],
        message: `Section "${name}" (${section.id}) opens with continue but is first in its division or part; use another opens value to clear this refusal.`,
      })
    } else if (!section.flowing || !before.flowing) {
      issues.push({
        path: [...section.path, 'opens'],
        message: `Section "${name}" (${section.id}) opens with continue but it or the preceding section has no flow to join; use another opens value to clear this refusal.`,
      })
    } else if (!sameBookPageGeometry(section.geometry, before.geometry)) {
      const beforeName = before.geometry?.name ?? 'the preceding geometry'
      const currentName = section.geometry?.name ?? section.pageGeometry ?? 'the section geometry'
      issues.push({
        path: [...section.path, 'opens'],
        message: `Section "${name}" (${section.id}) opens with continue but its resolved page geometry ${JSON.stringify(currentName)} differs from the preceding section's ${JSON.stringify(beforeName)}; use the same geometry, or another opens value to clear this refusal.`,
      })
    }
    if (section.numbering !== undefined) {
      issues.push({
        path: [...section.path, 'numbering'],
        message: `Section "${name}" (${section.id}) opens with continue and sets numbering, but a continuing section has no first page to count or restart; remove numbering or use another opens value to clear this refusal.`,
      })
    }
    if (section.parents !== undefined) {
      issues.push({
        path: [...section.path, 'parents'],
        message: `Section "${name}" (${section.id}) opens with continue and sets parents, but a continuing section has no first page to dress; remove parents or use another opens value to clear this refusal.`,
      })
    }
  }
  return issues
}
