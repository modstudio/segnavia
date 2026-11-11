import { embedFunction } from '@segnavia/html'
import { backgroundPaints, decorationEdges, parseBoxShadows, shadowParts } from './composer-decoration.ts'
import {
  applyBoxDecorations,
  composerLayoutReady,
  descendantKeepSignals,
  forcedPageBreak,
  inlineLevelDisplay,
  keepSignals,
  measuredBlockConstraints,
  measuredCandidateKeeps,
  measuredCandidateRun,
  measuredDecorationBoxes,
  measuredKeepRuns,
  measureLineBoxes,
  measurementRefusal,
  outermostKeepValue,
  sizeFlowGalley,
  skippableDescendantBoxDisplay,
  tableRowLines,
} from './composer-measure.ts'

export function embeddedComposerMeasureFunctions(): string {
  return [
    embedFunction('keepSignals', keepSignals),
    embedFunction('outermostKeepValue', outermostKeepValue),
    embedFunction('descendantKeepSignals', descendantKeepSignals),
    embedFunction('inlineLevelDisplay', inlineLevelDisplay),
    embedFunction('skippableDescendantBoxDisplay', skippableDescendantBoxDisplay),
    embedFunction('measuredBlockConstraints', measuredBlockConstraints),
    embedFunction('measuredCandidateRun', measuredCandidateRun),
    embedFunction('measuredCandidateKeeps', measuredCandidateKeeps),
    embedFunction('measuredKeepRuns', measuredKeepRuns),
    embedFunction('backgroundPaints', backgroundPaints),
    embedFunction('shadowParts', shadowParts),
    embedFunction('parseBoxShadows', parseBoxShadows),
    embedFunction('measuredDecorationBoxes', measuredDecorationBoxes),
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
