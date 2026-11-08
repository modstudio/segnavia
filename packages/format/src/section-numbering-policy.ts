import type { SectionNumbering } from './folio.ts'
import type { NumberSystem } from './numbering.ts'

export interface SectionNumberingFact {
  id: string
  title?: string
  division: 'front' | 'body' | 'end'
  path: (string | number)[]
  numbering: SectionNumbering
}

export interface SectionNumberingPolicyInput {
  mode: 'continuous' | 'paginated'
  systems: { frontMatter: NumberSystem; body: NumberSystem }
  sections: readonly SectionNumberingFact[]
  printedPageRules: boolean
}

export interface SectionNumberingIssue {
  path: (string | number)[]
  message: string
}

function sectionLabel(section: SectionNumberingFact): string {
  return section.title ?? section.id
}

function systemMaximum(system: NumberSystem): number | undefined {
  if (system === 'hebrew') return 9999
  if (system === 'roman-lower' || system === 'roman-upper') return 3999
  return undefined
}

export function sectionNumberingIssues(input: SectionNumberingPolicyInput): SectionNumberingIssue[] {
  return input.sections.flatMap((section) => {
    const label = sectionLabel(section)
    if (input.mode === 'continuous') {
      return [
        {
          path: [...section.path, 'numbering'],
          message: `Section "${label}" (${section.id}) sets numbering, but continuous books cannot apply section numbering; use the paginated layout or remove numbering from section "${label}" to clear this refusal.`,
        },
      ]
    }
    if (input.printedPageRules) {
      return [
        {
          path: [...section.path, 'numbering'],
          message: `Section "${label}" (${section.id}) sets numbering together with printed-page rules, whose numbering replaces plan folios; remove section numbering or the printed-page rules to clear this refusal.`,
        },
      ]
    }
    const system = section.division === 'front' ? input.systems.frontMatter : input.systems.body
    const maximum = systemMaximum(system)
    const restart = section.numbering.restart
    if (maximum === undefined || restart === undefined || restart <= maximum) return []
    return [
      {
        path: [...section.path, 'numbering', 'restart'],
        message: `Section "${label}" (${section.id}) restart ${restart} is outside the ${system} range 1 to ${maximum}; set restart within that range or change the ${section.division} division's numbering system to clear this refusal.`,
      },
    ]
  })
}
