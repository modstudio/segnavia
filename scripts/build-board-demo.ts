import { writeFileSync } from 'node:fs'
import path from 'node:path'

export function buildBoardDemo(site: string, image: string, shot: string) {
  writeFileSync(path.join(site, 'board-script.html'), `<!doctype html><script>parent.postMessage('board-script-ran', '*')</script><p>Board URL slide</p>`)
  writeFileSync(
    path.join(site, 'board.html'),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>html,body{margin:0;height:100%;font-family:system-ui}body{display:grid;grid-template-columns:280px 1fr}segnavia-board-list{padding:16px;overflow:auto}segnavia-board-list::part(search){padding:8px;margin-block-end:12px}segnavia-board-list::part(group-title),segnavia-board-list::part(item){padding:7px;border:0}segnavia-board{display:block;inline-size:100%;block-size:100%;--segnavia-board-background:#ebebef;--segnavia-board-placeholder:#dcdce1;--segnavia-board-section:#c9c9d1;--segnavia-board-section-fill:#e1e1e7;--segnavia-board-item-title:#86868f;--segnavia-board-section-title:#1d1d22}segnavia-board::part(item){box-shadow:0 1px 3px #0002;background:white}segnavia-board::part(item-title){font-size:13px;padding-block-end:6px}segnavia-board::part(section){border-radius:12px}segnavia-board::part(section-title){font-size:14px;font-weight:500;padding:5px 12px;margin-block-end:8px;border:1px solid #9d9da6;border-radius:7px;background:#e1e1e7}segnavia-board::part(label){font-weight:600}</style></head>
    <body><segnavia-board-list for="board"></segnavia-board-list><segnavia-board id="board"></segnavia-board><script type="module" src="segnavia.js"></script><script type="module">
      await customElements.whenDefined('segnavia-board')
      const board = document.getElementById('board')
      const [deck, hebrew, responsive] = await Promise.all(['deck.json','deck-he.json','responsive-deck.json'].map(src => fetch(src).then(response => response.json())))
      const page = {html:'<main style="font:32px system-ui;padding:36px"><h1>Board page</h1><p>A local fixed page.</p></main>',size:{width:640,height:900},scripts:'refuse'}
      const paperPages = [{html:'<main style="font:32px system-ui;padding:36px"><h1>Paper</h1></main>',size:{width:600,height:800},scripts:'refuse'}]
      const imposition = {paper:'letter',orientation:'portrait',columns:1,rows:1,cell:{width:215.9,height:279.4}}
      const urlDeck = {title:'URL deck',size:{width:1280,height:720},layout:'fixed',fit:'contain',frame:false,scripts:'refuse',slides:[{id:'url',content:{kind:'url',src:'board-script.html'}}]}
      const reviewItems = [
        {id:'deck-url',kind:'deck',address:'url',x:1400,y:0,width:320},
        {id:'paper-empty',kind:'paper',address:'empty',x:3000,y:0,width:320},
      ]
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
        deck:{kind:'deck',deck,title:'Creating a class'}, hebrew:{kind:'deck',deck:hebrew,title:'מצגת'}, responsive:{kind:'deck',deck:responsive,title:'Responsive deck'}, url:{kind:'deck',deck:urlDeck,title:'URL deck'},
        page:{kind:'page',page,size:{width:640,height:900},title:'Page'}, paper:{kind:'paper',pages:paperPages,imposition,size:{width:816,height:1056},title:'Paper'},
        empty:{kind:'paper',pages:[],imposition,size:{width:816,height:1056},title:'Empty paper'},
        image:{kind:'image',src:${JSON.stringify(image)},width:1280,height:720,title:'Image'}, shot:{kind:'shot',src:${JSON.stringify(shot)},width:1280,height:720,title:'Shot'},
      }
      window.boardErrors = []
      window.boardUnhandled = []
      window.boardScriptRan = false
      window.addEventListener('message', event => { if (event.data === 'board-script-ran') window.boardScriptRan = true })
      window.addEventListener('unhandledrejection', event => { window.boardUnhandled.push(String(event.reason)) })
      board.addEventListener('segnavia-board-error', event => { window.boardErrors.push(event.detail) })
      board.resolveItem = item => new Promise(resolve => setTimeout(() => resolve(values[item.address]), 150))
      const names = {'deck-small':'Creating a class','deck-hebrew':'מַצֶּגֶת','page':'Page','paper':'Paper','image':'Image','shot':'Shot','deck-far':'Far away deck','deck-url':'URL deck','paper-empty':'Empty paper'}
      window.itemNamesCalls = 0
      board.itemNames = async items => { window.itemNamesCalls += 1; return Object.fromEntries(items.map(item => [item.id,names[item.id]])) }
      board.board = {...common,items:items.slice(0,-1)}
      await new Promise(requestAnimationFrame)
      window.initialItemNamesCalls = window.itemNamesCalls
      board.board = {...common,items}
      const list = document.querySelector('segnavia-board-list')
      list.searchItems = (query,signal) => new Promise((resolve,reject) => { const timer=setTimeout(() => resolve(query.toLowerCase().includes('content') ? ['deck-far'] : []),80); signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'))},{once:true}) })
      board.addEventListener('segnavia-board-open', event => { window.openedItem = event.detail.item })
      window.addBoardReviewItems = () => { board.board = {...board.board,items:[...board.board.items,...reviewItems]} }
      window.demoBoard = board
    </script></body></html>`,
  )
}
