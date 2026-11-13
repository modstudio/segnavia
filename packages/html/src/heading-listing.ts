import type { HeadingListing } from '@segnavia/format'
import type { Element } from 'domhandler'

const VALUES = ['none', 'outline', 'contents'] as const

export function headingListing(heading: Pick<Element, 'attribs'>): HeadingListing {
  if (heading.attribs['data-contents'] === 'exclude') {
    throw new Error(
      'data-contents="exclude" is no longer accepted; use data-segnavia-listed="outline" to keep the heading only in the outline, or data-segnavia-listed="none" to omit it from both lists.',
    )
  }
  const value = heading.attribs['data-segnavia-listed']
  if (value === undefined) return { contents: true, outline: true }
  if (value === 'none') return { contents: false, outline: false }
  if (value === 'outline') return { contents: false, outline: true }
  if (value === 'contents') return { contents: true, outline: false }
  throw new Error(`data-segnavia-listed value ${JSON.stringify(value)} is not accepted; use one of ${VALUES.join(', ')} to clear this refusal.`)
}
