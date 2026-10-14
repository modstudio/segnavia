import { writeFileSync } from 'node:fs'
import path from 'node:path'

export function buildDeckHost(site: string) {
  writeFileSync(
    path.join(site, 'deck-host.html'),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Window deck</title><style>
html,body{margin:0;max-inline-size:100%;overflow-x:hidden;font:16px system-ui,sans-serif}*{box-sizing:border-box}
#deck-root{min-block-size:100vh;background:#eee;--segnavia-backdrop:#121212}.layout{display:grid;grid-template-columns:120px minmax(0,1fr)}
#rail{padding:8px;overflow:auto}.main{min-inline-size:0;padding-inline:12px}segnavia-stage{inline-size:100%;padding-inline:8px}
#controls{block-size:140px;display:flex;align-items:center;gap:8px}textarea{display:block;inline-size:100%;block-size:172px}
[data-presenting] .layout{display:block}[data-presenting] #rail,[data-presenting] textarea{display:none}[data-presenting] .main{padding:0}
</style></head><body><div id="deck-root"><div class="layout"><nav id="rail"></nav><main class="main">
<segnavia-stage id="deck" neighbors fit="viewport"></segnavia-stage><div id="controls"><button id="previous">Previous</button>
<button id="next">Next</button><button id="present">Present</button><output id="counter"></output></div>
<textarea id="notes">Notes stay editable</textarea></main></div></div><script type="module" src="segnavia-controls.js"></script>
<script type="module">
await customElements.whenDefined('segnavia-stage')
const lib = await import('./segnavia.js')
const stage = document.getElementById('deck')
const root = document.getElementById('deck-root')
const makeSlide = id => ({id,content:{kind:'html',html:'<!doctype html><html><head><style>h1{color:rgb(0, 128, 0)}</style></head><body style="margin:0;height:100vh;display:grid;place-items:center"><h1>'+id+'</h1></body></html>'}})
const makeDeck = ids => ({title:'Window deck',scripts:'refuse',slides:ids.map(makeSlide)})
let ids = Array.from({length:Number(new URLSearchParams(location.search).get('slides')||40)},(_,index)=>'slide-'+(index+1))
const controller = new lib.DeckController({keys:'page'})
stage.controller = controller
stage.css = 'h1{color:rgb(200, 0, 0)}'
stage.reserve = {blockStart:140,blockEnd:172}
const rail = document.getElementById('rail')
for(let index=0;index<ids.length;index++){const button=document.createElement('button');button.textContent=String(index+1);button.onclick=()=>controller.go(index);rail.append(button)}
document.getElementById('previous').onclick=()=>controller.previous()
document.getElementById('next').onclick=()=>controller.next()
document.getElementById('present').onclick=()=>controller.state.presenting?controller.stopPresenting():controller.present(root)
controller.addEventListener('change',({detail})=>{document.getElementById('counter').textContent=(detail.index+1)+' / '+detail.deck.slides.length;stage.reserve=detail.presenting?{blockStart:140}:{blockStart:140,blockEnd:172}})
const api={controller,stage,get ids(){return ids},async reload(next){ids=next;await controller.load(makeDeck(ids))},deck:()=>makeDeck(ids)}
Object.defineProperty(window,'__deckHost',{value:api})
await controller.load(makeDeck(ids))
</script></body></html>`,
  )
}
