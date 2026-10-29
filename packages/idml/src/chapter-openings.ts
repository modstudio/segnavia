export interface ChapterOpening {
  story: string
  page: string
  role: 'recto' | 'verso'
}

export interface ChapterOpenings {
  rectoOpenings: boolean
  verso: { story: string; page: string }[]
}

export function chapterOpenings(openings: ChapterOpening[], facingPages: boolean): ChapterOpenings {
  if (!facingPages) return { rectoOpenings: false, verso: [] }
  return {
    rectoOpenings: openings.length > 0 && openings.every((opening) => opening.role === 'recto'),
    verso: openings.filter((opening) => opening.role === 'verso').map(({ story, page }) => ({ story, page })),
  }
}
