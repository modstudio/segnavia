export function compact(value: string): string {
  return value.replaceAll(/[\s\u202a-\u202e\u2066-\u2069]/g, '')
}

export function decodeXml(value: string): string {
  return value.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'")
}

export function pageWith(pages: string[], value: string): number {
  return pages.findIndex((page) => page.includes(value)) + 1
}
