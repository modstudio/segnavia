import { execFileSync } from 'node:child_process'

export function compact(value: string): string {
  return value.replaceAll(/[\s\u202a-\u202e\u2066-\u2069]/g, '')
}

export function decodeXml(value: string): string {
  return value.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'")
}

export function pageWith(pages: string[], value: string): number {
  return pages.findIndex((page) => page.includes(value)) + 1
}

export function pagesText(file: string): string[] {
  return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\f')
    .slice(0, -1)
}
