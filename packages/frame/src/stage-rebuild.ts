export type StageRebuildAction = 'refresh' | 'update'

export function stageRebuildAction(sameController: boolean, shownFrameMounted: boolean, resolvesSlides: boolean): StageRebuildAction {
  return sameController && shownFrameMounted && resolvesSlides ? 'refresh' : 'update'
}
