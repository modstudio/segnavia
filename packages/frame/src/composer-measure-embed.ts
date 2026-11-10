import { embedFunction } from '@segnavia/html'
import { applyBoxDecorations, backgroundPaints, decorationEdges, parseBoxShadows, shadowParts } from './composer-decoration.ts'
import {
  composerLayoutReady,
  descendantKeepSignals,
  forcedPageBreak,
  inlineLevelDisplay,
  keepSignals,
  measuredBlockConstraints,
  measuredCandidateKeeps,
  measuredCandidateRun,
  measuredKeepRuns,
  measureLineBoxes,
  measurementRefusal,
  outermostKeepValue,
  sizeFlowGalley,
  tableRowLines,
} from './composer-measure.ts'

export function embeddedComposerMeasureFunctions(): string {
  return [
    embedFunction('keepSignals', keepSignals),
    embedFunction('outermostKeepValue', outermostKeepValue),
    embedFunction('descendantKeepSignals', descendantKeepSignals),
    embedFunction('inlineLevelDisplay', inlineLevelDisplay),
    embedFunction('measuredBlockConstraints', measuredBlockConstraints),
    embedFunction('measuredCandidateRun', measuredCandidateRun),
    embedFunction('measuredCandidateKeeps', measuredCandidateKeeps),
    embedFunction('measuredKeepRuns', measuredKeepRuns),
    embedFunction('backgroundPaints', backgroundPaints),
    embedFunction('shadowParts', shadowParts),
    embedFunction('parseBoxShadows', parseBoxShadows),
    embedFunction('decorationEdges', decorationEdges),
    embedFunction('applyBoxDecorations', applyBoxDecorations),
    embedFunction('forcedPageBreak', forcedPageBreak),
    embedFunction('composerLayoutReady', composerLayoutReady),
    embedFunction('sizeFlowGalley', sizeFlowGalley),
    embedFunction('tableRowLines', tableRowLines),
    embedFunction('measureLineBoxes', measureLineBoxes),
    embedFunction('measurementRefusal', measurementRefusal),
  ].join('\n')
}
