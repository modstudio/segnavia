export type StageControllerEdition = { stated: false; edition: string | undefined } | { stated: true; edition: string }

export function stageControllerEdition(current: string | undefined, attribute: string | undefined): StageControllerEdition {
  return attribute === undefined ? { stated: false, edition: current } : { stated: true, edition: attribute }
}
