export interface PageFrameIdentity {
  frame: HTMLIFrameElement | null
  generation: number
}

export function samePageFrame(current: PageFrameIdentity, owned: PageFrameIdentity | undefined): boolean {
  return current.frame !== null && current.frame === owned?.frame && current.generation === owned.generation
}
