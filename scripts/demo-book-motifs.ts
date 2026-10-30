import type { Motif } from '@segnavia/format'
import type { MotifsOptions } from '@segnavia/render'

export const BOOK_MOTIF_KEY = 'demo-book-ornament'
export const BOOK_FOLIO_MOTIF_KEY = 'demo-book-folio'
const BOOK_MOTIF_HTML = '<strong data-book-demo-motif>BOOK MOTIF</strong>'

const BOOK_MOTIF: Motif = {
  key: BOOK_MOTIF_KEY,
  revision: 'one',
  label: 'Book ornament',
  fields: [],
  versions: [
    { lang: 'en', html: BOOK_MOTIF_HTML },
    { lang: 'he', html: BOOK_MOTIF_HTML },
  ],
  fonts: [],
}

const BOOK_FOLIO_MOTIF: Motif = {
  key: BOOK_FOLIO_MOTIF_KEY,
  revision: 'one',
  label: 'Book printed-page folio',
  fields: [],
  versions: [
    { lang: 'en', html: '<strong data-book-demo-folio>PRINTED <span data-slot-value="printedPage.number"></span></strong>' },
    { lang: 'he', html: '<strong data-book-demo-folio>PRINTED <span data-slot-value="printedPage.number"></span></strong>' },
  ],
  fonts: [],
}

const BOOK_MOTIFS = [BOOK_MOTIF, BOOK_FOLIO_MOTIF]

export const bookMotifs: MotifsOptions = {
  source: {
    motif: async (key) => BOOK_MOTIFS.find((motif) => motif.key === key),
  },
}

export const bookMotifSetup = `<script type="module">const motifs=${JSON.stringify(BOOK_MOTIFS)};await customElements.whenDefined('segnavia-book');for(const book of document.querySelectorAll('segnavia-book'))book.motifs={source:{motif:async key=>motifs.find(motif=>motif.key===key)}}</script>`
