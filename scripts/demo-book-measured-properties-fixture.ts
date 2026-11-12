import type { DocumentInput } from '@segnavia/format'

export const MEASURE_COLUMN_UNIT = 45

export function measuredPropertiesFixture(): DocumentInput {
  const flowing = 'A measured paragraph keeps its source property on every dressed page copy. '.repeat(180)
  const fitted = 'Measured line count follows the fitted type rather than the authored type.'
  const html = `<figure class="measure-probe" data-segnavia-id="wide-words" data-measure="max-content-inline:children" data-measure-as="--widest"><span>map</span><span>characteristically</span><div class="derived-columns"></div></figure>
<figure class="measure-probe" data-segnavia-id="narrow-words" data-measure="max-content-inline:children" data-measure-as="--widest"><span>map</span><span>harbor</span><div class="derived-columns"></div></figure>
<figure class="measure-probe hebrew-measure" lang="he" dir="rtl" data-segnavia-id="pointed-word" data-measure="max-content-inline:children" data-measure-as="--word-width"><span>בְּרֵאשִׁית</span></figure>
<figure class="measure-probe hebrew-measure" lang="he" dir="rtl" data-segnavia-id="plain-word" data-measure="max-content-inline:children" data-measure-as="--word-width"><span>בראשית</span></figure>
<div class="fit-measure-box"><p data-segnavia-id="fitted-lines" data-fit="size" data-fit-min="10px" data-fit-step="1px" data-fit-axis="both" data-fit-box="parent" data-measure="line-count" data-measure-as="--fitted-lines">${fitted}</p></div>
<p class="flowing-measure" data-segnavia-id="flowing-measure" data-measure="block" data-measure-as="--flow-block">${flowing}</p>`
  const css = `
    :where(html){font:16px/24px Georgia,serif}
    :where(.measure-probe){margin:8px 0}
    :where(.measure-probe>span){display:inline-block;margin-inline-end:8px}
    :where(.derived-columns){column-count:clamp(1,round(down,calc(var(--widest) / ${MEASURE_COLUMN_UNIT}px),1),4);block-size:24px}
    :where(.derived-columns)::before{content:'one two three four five six seven eight';}
    :where(.hebrew-measure){font:24px/36px NotoSerifHebrew,serif}
    :where(.fit-measure-box){box-sizing:border-box;inline-size:180px;block-size:76px}
    :where(.fit-measure-box p){box-sizing:border-box;margin:0;font-size:28px;line-height:1.2}
    :where(.flowing-measure){margin:0}`
  return {
    type: 'document',
    kind: 'book',
    metadata: { title: 'Measured properties' },
    mode: 'paginated',
    settings: { lang: 'en' },
    page: { paper: 'a5', margin: { blockStart: 18, blockEnd: 18, inlineStart: 18, inlineEnd: 18 } },
    style: { css },
    templates: [{ type: 'template', name: 'measure-card', html: '<main class="template-measure-card" data-region="body"></main>' }],
    children: [
      {
        type: 'division',
        name: 'body',
        children: [{ type: 'section', title: 'Measured properties', children: [{ type: 'flow', html }] }],
      },
      {
        type: 'division',
        name: 'end',
        children: [
          {
            type: 'section',
            title: 'Measured template source',
            template: 'measure-card',
            children: [
              {
                type: 'page',
                regions: {
                  body: '<figure data-segnavia-id="template-measure" data-measure="max-content-inline:children" data-measure-as="--template-width"><span>template measurement</span></figure>',
                },
              },
            ],
          },
        ],
      },
    ],
  }
}
