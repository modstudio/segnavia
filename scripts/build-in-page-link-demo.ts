import { writeFileSync } from 'node:fs'
import path from 'node:path'

const html = (authorPrevents: boolean) => `<!doctype html><html><body style="margin:0;font:20px sans-serif">
<a id="jump" href="#far">Jump to target</a>${authorPrevents ? '<a id="blocked" href="#far">Blocked by author</a>' : ''}
<div style="height:700px"></div><h2 id="far">Far target</h2><div style="height:400px"></div>
${authorPrevents ? '<script>document.getElementById("blocked").addEventListener("click",function(event){event.preventDefault()})</script>' : ''}
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
