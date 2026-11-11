export async function loadPageUrl(value: string, base: string, load: (input: unknown) => void): Promise<void> {
  const response = await fetch(new URL(value, base))
  if (!response.ok) throw new Error(`The page at ${value} answered ${response.status}.`)
  load(await response.json())
}
