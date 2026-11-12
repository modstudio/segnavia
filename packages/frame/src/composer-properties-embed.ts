import { MEASURE_KIND_MODEL } from '@segnavia/format'
import { embedFunction } from '@segnavia/html'
import {
  directMeasurementNodes,
  graphemeInlineExtent,
  MEASURERS,
  measuredValue,
  measurePropertyElement,
  measureSourcePropertiesImplementation,
  propertySources,
  requireMeasuredLayout,
} from './composer-properties.ts'
import { measuredProperties, propertyCssValue } from './composer-properties-policy.ts'

function embeddedMeasurers(): string {
  const functions = [...new Set(Object.values(MEASURERS))]
  const definitions = functions.map((measure) => embedFunction(measure.name, measure)).join('\n')
  const entries = Object.entries(MEASURERS).map(([kind, measure]) => `${JSON.stringify(kind)}:${measure.name}`)
  return `${definitions}\nvar MEASURERS={${entries.join(',')}};`
}

export function embeddedComposerPropertyFunctions(): string {
  return `var MEASURE_KIND_MODEL=${JSON.stringify(MEASURE_KIND_MODEL)};
${embeddedMeasurers()}
${embedFunction('propertyCssValue', propertyCssValue)}
${embedFunction('measuredProperties', measuredProperties)}
${embedFunction('directMeasurementNodes', directMeasurementNodes)}
${embedFunction('graphemeInlineExtent', graphemeInlineExtent)}
${embedFunction('measuredValue', measuredValue)}
${embedFunction('measurePropertyElement', measurePropertyElement)}
${embedFunction('requireMeasuredLayout', requireMeasuredLayout)}
${embedFunction('propertySources', propertySources)}
${embedFunction('measureSourcePropertiesImplementation', measureSourcePropertiesImplementation)}
var propertyStageState={done:false,results:[]};
var measureSourceProperties=function(){return runStageOnce(propertyStageState,function(){return measureSourcePropertiesImplementation(document,geometryFor,config.direction,config.lang,function(element){return blockLines(element,originTop(element));});});};`
}
