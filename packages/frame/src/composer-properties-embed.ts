import { MEASURE_KIND_MODEL } from '@segnavia/format'
import { embedFunction } from '@segnavia/html'
import {
  directMeasurementNodes,
  graphemeInlineExtent,
  measuredValue,
  measurePropertyElement,
  measureSourcePropertiesImplementation,
  propertySources,
  requireMeasuredLayout,
} from './composer-properties.ts'
import { measuredProperties, propertyCssValue } from './composer-properties-policy.ts'

export function embeddedComposerPropertyFunctions(): string {
  return `var MEASURE_KIND_MODEL=${JSON.stringify(MEASURE_KIND_MODEL)};
var MEASURERS={"max-content-inline:children":function(element,writingMode){return Math.max(0,...directMeasurementNodes(element).map(function(node){return graphemeInlineExtent(node,writingMode);}));},"block":function(element,writingMode){return logicalExtent(element.getBoundingClientRect(),writingMode,"block");},"line-count":function(element,_writingMode,lineBoxes){return lineBoxes(element).length;}};
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
