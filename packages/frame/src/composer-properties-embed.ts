import { embedFunction } from '@segnavia/html'
import {
  directMeasurementNodes,
  graphemeInlineExtent,
  lineRects,
  measuredValue,
  measurePropertyElement,
  measureSourcePropertiesImplementation,
  propertySources,
} from './composer-properties.ts'
import { logicalExtent, logicalLineCount, measuredProperties, propertyValue, runPropertyStageOnce, verticalWritingMode } from './composer-properties-policy.ts'

export function embeddedComposerPropertyFunctions(): string {
  return `${embedFunction('verticalWritingMode', verticalWritingMode)}
${embedFunction('logicalExtent', logicalExtent)}
${embedFunction('logicalLineCount', logicalLineCount)}
${embedFunction('propertyValue', propertyValue)}
${embedFunction('measuredProperties', measuredProperties)}
${embedFunction('runPropertyStageOnce', runPropertyStageOnce)}
${embedFunction('directMeasurementNodes', directMeasurementNodes)}
${embedFunction('graphemeInlineExtent', graphemeInlineExtent)}
${embedFunction('lineRects', lineRects)}
${embedFunction('measuredValue', measuredValue)}
${embedFunction('measurePropertyElement', measurePropertyElement)}
${embedFunction('propertySources', propertySources)}
${embedFunction('measureSourcePropertiesImplementation', measureSourcePropertiesImplementation)}
var propertyStageState={done:false,results:[]};
var measureSourceProperties=function(){return runPropertyStageOnce(propertyStageState,function(){return measureSourcePropertiesImplementation(document,geometryFor,config.direction,config.lang);});};`
}
