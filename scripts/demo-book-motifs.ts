import type { MotifsOptions } from '@segnavia/render'

export const BOOK_MOTIF_KEY = 'demo-book-ornament'
const BOOK_MOTIF_HTML = '<strong data-book-demo-motif>BOOK MOTIF</strong>'

export const bookMotifs: MotifsOptions = {
  source: {
    motif: async (key) =>
      key === BOOK_MOTIF_KEY
        ? {
            key,
            revision: 'one',
            label: 'Book ornament',
            fields: [],
            versions: [
              { lang: 'en', html: BOOK_MOTIF_HTML },
              { lang: 'he', html: BOOK_MOTIF_HTML },
            ],
            fonts: [],
          }
        : undefined,
  },
}

export const bookMotifSetup = `<script type="module">await customElements.whenDefined('segnavia-book');for(const book of document.querySelectorAll('segnavia-book'))book.motifs={source:{motif:async key=>key==='${BOOK_MOTIF_KEY}'?{key,revision:'one',label:'Book ornament',fields:[],versions:[{lang:'en',html:'${BOOK_MOTIF_HTML}'},{lang:'he',html:'${BOOK_MOTIF_HTML}'}],fonts:[]}:undefined}}</script>`
