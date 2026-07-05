import {
  APPLICATION_ERROR_RETRYABILITY,
  type ApplicationError,
} from '../../domain'
import type {
  SessionRevisionReference,
  SessionStateRepository,
  SubtitlePublisher,
  TranslationRefiner,
} from '../../ports'

export interface ProcessRefinementInput extends SessionRevisionReference {}

export type RefinementAcknowledgementReason =
  | 'stale'
  | 'already_completed'
  | 'not_found'
  | 'connection_gone'

export type ProcessRefinementResult =
  | { kind: 'completed'; reference: SessionRevisionReference }
  | {
      kind: 'acknowledged'
      reason: RefinementAcknowledgementReason
      reference: SessionRevisionReference
    }
  | {
      kind: 'failed'
      disposition: 'retry'
      reference: SessionRevisionReference
      error: ApplicationError
    }

export interface ProcessRefinementDependencies {
  repository: SessionStateRepository
  refiner: TranslationRefiner
  publisher: SubtitlePublisher
  contextLimit: number
}

const acknowledged = (
  reference: SessionRevisionReference,
  reason: RefinementAcknowledgementReason,
): ProcessRefinementResult => ({ kind: 'acknowledged', reason, reference })

const failed = (
  reference: SessionRevisionReference,
  error: ApplicationError,
): ProcessRefinementResult => ({
  kind: 'failed',
  disposition: 'retry',
  reference,
  error,
})

const internalError = (message: string): ApplicationError => ({
  code: 'INTERNAL_ERROR',
  message,
  retryable: APPLICATION_ERROR_RETRYABILITY.INTERNAL_ERROR,
})

export const createProcessRefinement =
  (dependencies: ProcessRefinementDependencies) =>
  async (
    reference: ProcessRefinementInput,
  ): Promise<ProcessRefinementResult> => {
    const sessionResult = await dependencies.repository.getSession(
      reference.sessionId,
    )
    if (sessionResult.kind === 'not_found')
      return acknowledged(reference, 'not_found')
    if (sessionResult.kind === 'failed')
      return failed(reference, sessionResult.error)
    if (!sessionResult.value.connection)
      return acknowledged(reference, 'connection_gone')

    const segmentResult = await dependencies.repository.getSegment(reference)
    if (segmentResult.kind === 'not_found')
      return acknowledged(reference, 'not_found')
    if (segmentResult.kind === 'failed')
      return failed(reference, segmentResult.error)
    if (
      segmentResult.segment.sessionId !== reference.sessionId ||
      segmentResult.segment.segmentId !== reference.segmentId ||
      segmentResult.segment.revision !== reference.revision
    )
      return acknowledged(reference, 'stale')

    const segment = segmentResult.segment
    if (
      !segment.isFinal ||
      segment.draftText === undefined ||
      segment.refinedText !== undefined ||
      (segment.refinementStatus !== 'PENDING' &&
        segment.refinementStatus !== 'QUEUED')
    )
      return failed(
        reference,
        internalError('Current final segment has invalid refinement state'),
      )

    const contextResult =
      await dependencies.repository.getPreviousFinalSegments({
        sessionId: reference.sessionId,
        beforeSequence: reference.sequence,
        limit: dependencies.contextLimit,
      })
    if (contextResult.kind !== 'loaded')
      return failed(reference, contextResult.error)

    const refined = await dependencies.refiner.refine({
      sourceText: segment.sourceText,
      draftText: segment.draftText,
      sourceLanguage: sessionResult.value.session.sourceLanguage,
      targetLanguage: sessionResult.value.session.targetLanguage,
      context: contextResult.context,
    })
    if (refined.kind === 'failed') return failed(reference, refined.error)

    const saved = await dependencies.repository.saveRefined({
      reference,
      refinedText: refined.text,
    })
    if (saved.kind !== 'stored')
      return failed(
        reference,
        internalError('Refined result was not stored by the current worker'),
      )
    if (saved.segment.refinedText === undefined)
      return failed(
        reference,
        internalError('Stored refined result has no refined text'),
      )

    const published = await dependencies.publisher.publishRefined(
      sessionResult.value.connection,
      { reference, text: saved.segment.refinedText },
    )
    if (published.kind === 'failed') return failed(reference, published.error)
    return { kind: 'completed', reference }
  }
