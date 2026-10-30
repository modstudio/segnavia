import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { Page } from '@segnavia/format'

export const SCRIPTED_CHART_URL = 'https://cdn.jsdelivr.net/npm/segnavia-chart-stub@1.0.0/chart.min.js'
export const SCRIPTED_FONT_CSS_URL = 'https://fonts.googleapis.com/css2?family=Scripted+Demo+Fixture'
export const SCRIPTED_FONT_URL = 'https://fonts.gstatic.com/s/scripteddemofixture/v1/demo.ttf'

export function buildScriptedDependencyDemo(site: string, shell: (body: string) => string): void {
  const page = Page.parse({
    scripts: 'sandboxed',
    size: { width: 640, height: 430 },
    html: `<link rel="stylesheet" href="${SCRIPTED_FONT_CSS_URL}"><style>
      body{box-sizing:border-box;margin:0;padding:24px;font:16px "Scripted Demo Fixture",sans-serif;color:#172033}
      form{display:flex;gap:8px}#chart-rendered{display:flex;align-items:end;gap:5px;height:38px;margin-block:18px}
      #chart-rendered i{display:block;width:18px;background:#2563eb}output,p{display:block;margin-block:12px}
    </style>
      <form id="choices"><select id="topic"><option>Reading</option><option>Math</option></select><input id="name" value="Mina"><button type="submit">Show choice</button></form>
      <output id="submitted">Waiting for a choice</output><div id="chart"></div><p id="storage">Storage waiting</p><p id="fetch">Fetch waiting</p>
      <script src="${SCRIPTED_CHART_URL}"></script><script>
        if (window.drawFixtureChart) drawFixtureChart(document.getElementById('chart'))
        document.getElementById('choices').addEventListener('submit', function (event) {
          event.preventDefault()
          document.getElementById('submitted').textContent = document.getElementById('topic').value + ' for ' + document.getElementById('name').value
        })
        fetch('https://example.com/').then(function () {
          document.getElementById('fetch').textContent = 'Fetch unexpectedly succeeded'
        }, function () {
          document.getElementById('fetch').textContent = 'Fetch refused'
        })
        window.addEventListener('load', function () {
          setTimeout(function () {
            var link = document.querySelector('link[rel=stylesheet]')
            link.onload = function () { document.documentElement.dataset.fontCss = 'loaded' }
            document.head.append(link)
          }, 0)
        })
        localStorage.setItem('demo-local', 'local-ok')
        sessionStorage.setItem('demo-session', 'session-ok')
        document.getElementById('storage').textContent = localStorage.getItem('demo-local') + ' / ' + sessionStorage.getItem('demo-session')
      </script>`,
  })
  writeFileSync(path.join(site, 'scripted-dependencies-page.json'), JSON.stringify(page))
  writeFileSync(
    path.join(site, 'scripted-dependencies.html'),
    shell(`<segnavia-page id="scripted-dependencies"></segnavia-page><script type="module">
      await import('./segnavia.js')
      await customElements.whenDefined('segnavia-page')
      const view = document.getElementById('scripted-dependencies')
      view.dependencyOrigins = ['https://cdn.jsdelivr.net', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com']
      view.page = await fetch('scripted-dependencies-page.json').then(response => response.json())
    </script>`),
  )
  // Reading these here makes the demo build fail early if either routed fixture is missing.
  const fixtures = path.join(import.meta.dir, '../fixtures/scripted-dependencies')
  readFileSync(path.join(fixtures, 'chart-stub.js'))
  readFileSync(path.join(fixtures, 'font.css'))
}
