export interface ParentPaperFact {
  section: string
  parent: string
  path: (string | number)[]
  paper: { width: number; height: number }
  textArea: { width: number; height: number }
}

export interface ParentPaperIssue {
  path: (string | number)[]
  message: string
}

export function parentPaperIssues(facts: readonly ParentPaperFact[]): ParentPaperIssue[] {
  return facts.flatMap((fact) => {
    if (fact.textArea.width > 0 && fact.textArea.height > 0) return []
    return [
      {
        path: fact.path,
        message: `Section "${fact.section}" names parent page "${fact.parent}", whose ${fact.textArea.width}mm by ${fact.textArea.height}mm text area does not fit on ${fact.paper.width}mm by ${fact.paper.height}mm paper; reduce the parent margins, use larger paper, or remove that parent to clear this refusal.`,
      },
    ]
  })
}
