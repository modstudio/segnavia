export function reloadPageEdition(input: unknown, load: (input: unknown) => void, refuse: (error: unknown) => void): void {
  if (input === undefined) return
  try {
    load(input)
  } catch (error) {
    refuse(error)
  }
}
