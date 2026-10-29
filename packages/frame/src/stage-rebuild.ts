export type StageRebuildAction = 'refresh' | 'update'

export function stageRebuildAction(controllerUnchanged: boolean, shownFrameMounted: boolean, resolvesSlides: boolean): StageRebuildAction {
  return controllerUnchanged && shownFrameMounted && resolvesSlides ? 'refresh' : 'update'
}
