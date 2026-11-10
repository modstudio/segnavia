export function embedFunction(name: string, fn: { name: string; toString(): string }): string {
  return `var ${fn.name}=${fn.toString()};var ${name}=${fn.name};`
}
