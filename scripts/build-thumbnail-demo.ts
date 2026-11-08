import { writeFileSync } from 'node:fs'
import path from 'node:path'

export function buildThumbnailDemo(site: string, shell: (body: string, script?: string) => string, picture: string) {
  writeFileSync(
    path.join(site, 'thumbnails.html'),
    shell(
      `<style>
        body{min-block-size:3200px}
        .covers{display:flex;gap:24px}
        segnavia-thumbnail{inline-size:320px;border-radius:12px}
        segnavia-thumbnail::part(thumbnail){box-shadow:inset 0 0 0 2px #333}
      </style>
      <div class="covers"><segnavia-thumbnail id="html"></segnavia-thumbnail><segnavia-thumbnail id="shot"></segnavia-thumbnail></div>
      <div class="covers"><segnavia-thumbnail id="designed-live"></segnavia-thumbnail><segnavia-thumbnail id="designed-picture"></segnavia-thumbnail></div>
      <script type="module">
        await customElements.whenDefined('segnavia-thumbnail')
        const deck = await fetch('deck.json').then((response) => response.json())
        for (const thumbnail of document.querySelectorAll('segnavia-thumbnail')) {
          thumbnail.base = new URL('deck.json', location.href).href
          thumbnail.css = 'body{border-block-start:7px solid rgb(0, 128, 0)}'
          thumbnail.deck = deck
        }
        document.getElementById('shot').index = 1
        const cover = {page:{type:'document',kind:'page',print:{paper:{width:100,height:150,unit:'mm'}},children:[{type:'page',body:{html:'<main data-designed-cover style="font:24px system-ui;padding:20px">Designed cover</main>'}}]}}
        document.getElementById('designed-live').designedCover = {cover}
        document.getElementById('designed-picture').designedCover = {cover,picture:${JSON.stringify(picture)}}
      </script>`,
      'segnavia.js',
    ),
  )
}
