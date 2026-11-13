import { DeckRefusedError } from './deck-refusal.ts'
import { dispatchElementError } from './element-error.ts'
import { hasWindow } from './schedule.ts'

export async function loadControllerUrl(target: EventTarget, src: string, load: (input: unknown, base: string) => Promise<void>): Promise<void> {
  const url = new URL(src, hasWindow ? location.href : undefined).href
  let input: unknown
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`The deck at ${url} answered ${response.status}.`)
    input = await response.json()
  } catch (error) {
    const refusal = new DeckRefusedError(error, url)
    dispatchElementError(target, refusal)
    throw error
  }
  await load(input, url)
}

export function controllerUrl(path: string, base: string | undefined, fallback: string | undefined): string {
  return new URL(path, base ?? fallback).href
}
