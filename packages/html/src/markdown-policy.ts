import type { ConverterPolicy } from './sanitize.ts'

export const MARKDOWN_CONVERTER_POLICY: ConverterPolicy = {
  urls: {
    linkProtocols: ['https:', 'http:', 'mailto:'],
    linkFragments: true,
    dataImages: true,
  },
}
