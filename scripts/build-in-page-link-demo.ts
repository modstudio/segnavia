import { writeFileSync } from 'node:fs'
import path from 'node:path'

const html = (authorPrevents: boolean) => `<!doctype html><html><body style="margin:0;font:20px sans-serif">
<a id="jump" href="#far">Jump to target</a>
<a id="jump-percent" href="#far%">Jump to literal percent target</a>
<a id="jump-cafe" href="#caf%C3%A9">Jump to encoded target</a>
<a id="jump-hebrew" href="#פרק">Jump to Hebrew target</a>
${authorPrevents ? '<a id="blocked" href="#far">Blocked by author</a><a id="blocked-delegated" href="#far">Blocked by delegated author handler</a>' : ''}
<div style="height:700px"></div><h2 id="far">Far target</h2>
<div style="height:500px"></div><h2 id="far%">Literal percent target</h2>
<div style="height:500px"></div><h2 id="café">Encoded target</h2>
<div style="height:500px"></div><h2 id="פרק">Hebrew target</h2><div style="height:400px"></div>
${
  authorPrevents
    ? '<script>document.getElementById("blocked").addEventListener("click",function(event){event.preventDefault()});document.addEventListener("click",function(event){if(event.target.id==="blocked-delegated")event.preventDefault()})</script>'
    : ''
}
</body></html>`

export function buildInPageLinkDemo(site: string): string {
  for (const scripts of ['refuse', 'sandboxed'] as const) {
    const content = html(scripts === 'sandboxed')
    writeFileSync(path.join(site, `link-page-${scripts}.json`), JSON.stringify({ html: content, scripts, size: { width: 420, height: 240 } }))
    writeFileSync(
      path.join(site, `link-slide-${scripts}.json`),
      JSON.stringify({
        title: 'In-page link',
        scripts,
        size: { width: 640, height: 360 },
        slides: [{ id: 'link', content: { kind: 'html', html: content } }],
      }),
    )
  }
  return '<segnavia-page id="link-page-refuse" src="link-page-refuse.json"></segnavia-page><segnavia-page id="link-page-sandboxed" src="link-page-sandboxed.json"></segnavia-page><segnavia-stage id="link-slide-refuse" src="link-slide-refuse.json" hash="off" style="width:640px;height:360px"></segnavia-stage><segnavia-stage id="link-slide-sandboxed" src="link-slide-sandboxed.json" hash="off" style="width:640px;height:360px"></segnavia-stage>'
}
