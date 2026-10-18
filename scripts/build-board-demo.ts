import { writeFileSync } from 'node:fs'
import path from 'node:path'

export function buildBoardDemo(site: string, image: string, shot: string) {
  writeFileSync(
    path.join(site, 'board.html'),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>html,body{margin:0;height:100%;font-family:system-ui}segnavia-board{display:block;inline-size:100%;block-size:100%;--segnavia-board-background:#f5f5f2;--segnavia-board-placeholder:#ddd;--segnavia-board-section:#777}segnavia-board::part(item){box-shadow:0 1px 5px #0003;background:white}segnavia-board::part(label),segnavia-board::part(section-title){font-weight:600}</style></head>
    <body><segnavia-board id="board"></segnavia-board><script type="module" src="segnavia.js"></script><script type="module">
      await customElements.whenDefined('segnavia-board')
      const board = document.getElementById('board')
      const [deck, hebrew, responsive] = await Promise.all(['deck.json','deck-he.json','responsive-deck.json'].map(src => fetch(src).then(response => response.json())))
      const page = {html:'<main style="font:32px system-ui;padding:36px"><h1>Board page</h1><p>A local fixed page.</p></main>',size:{width:640,height:900},scripts:'refuse'}
      const paperPages = [{html:'<main style="font:32px system-ui;padding:36px"><h1>Paper</h1></main>',size:{width:600,height:800},scripts:'refuse'}]
      const imposition = {paper:'letter',orientation:'portrait',columns:1,rows:1,cell:{width:215.9,height:279.4}}
      const items = [
        {id:'deck-small',kind:'deck',address:'deck',x:0,y:0,width:220},
        {id:'deck-hebrew',kind:'deck',address:'hebrew',x:300,y:0,width:320},
        {id:'page',kind:'page',address:'page',x:700,y:0,width:180},
        {id:'paper',kind:'paper',address:'paper',x:930,y:0,width:180},
        {id:'image',kind:'image',address:'image',x:0,y:300,width:260},
        {id:'shot',kind:'shot',address:'shot',x:340,y:300,width:260},
        {id:'deck-far',kind:'deck',address:'responsive',x:5000,y:100,width:320},
      ]
      const common = {title:'Board demo',direction:'ltr',labels:[{id:'label',text:'Local assets',x:0,y:-70},{id:'label-he',text:'אוסף מקומי',x:700,y:-70}],sections:[{id:'section',title:'Two decks',rectangle:{x:-24,y:-30,width:670,height:250},items:['deck-small','deck-hebrew']}]}
      const values = {
        deck:{kind:'deck',deck,title:'Creating a class'}, hebrew:{kind:'deck',deck:hebrew,title:'מצגת'}, responsive:{kind:'deck',deck:responsive,title:'Responsive deck'},
        page:{kind:'page',page,size:{width:640,height:900},title:'Page'}, paper:{kind:'paper',pages:paperPages,imposition,size:{width:816,height:1056},title:'Paper'},
        image:{kind:'image',src:${JSON.stringify(image)},width:1280,height:720,title:'Image'}, shot:{kind:'shot',src:${JSON.stringify(shot)},width:1280,height:720,title:'Shot'},
      }
      board.resolveItem = item => new Promise(resolve => setTimeout(() => resolve(values[item.address]), 150))
      board.board = {...common,items:items.slice(0,-1)}
      await new Promise(requestAnimationFrame)
      board.board = {...common,items}
      board.addEventListener('segnavia-board-open', event => { window.openedItem = event.detail.item })
      window.demoBoard = board
    </script></body></html>`,
  )
}
