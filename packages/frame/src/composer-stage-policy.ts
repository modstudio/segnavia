export interface StageState<T> {
  done: boolean
  results: T
}

export function runStageOnce<T>(state: StageState<T>, execute: () => T): T {
  if (state.done) return state.results
  state.done = true
  state.results = execute()
  return state.results
}
