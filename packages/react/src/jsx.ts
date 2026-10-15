import type { ELEMENTS, PropsFor } from './elements.ts'

export type SegnaviaIntrinsicElements = {
  [K in keyof typeof ELEMENTS as (typeof ELEMENTS)[K]['tag']]: PropsFor<(typeof ELEMENTS)[K]>
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements extends SegnaviaIntrinsicElements {}
  }
}
