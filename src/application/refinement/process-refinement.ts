import {
  APPLICATION_ERROR_RETRYABILITY,
  type ApplicationError,
} from '../../domain'
import type {
  SessionConnection,
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

const publishCanonical = async (input: {
  dependencies: ProcessRefinementDependencies
  reference: SessionRevisionReference
  connection: SessionConnection
  text: string
  completedAtStart: boolean
}): Promise<ProcessRefinementResult> => {
  const published = await input.dependencies.publisher.publishRefined(
    input.connection,
    { reference: input.reference, text: input.text },
  )
  if (published.kind === 'failed') {
    if (published.error.code === 'CONNECTION_GONE')
      return acknowledged(input.reference, 'connection_gone')
    return failed(input.reference, published.error)
  }
  return input.completedAtStart
    ? acknowledged(input.reference, 'already_completed')
    : { kind: 'completed', reference: input.reference }
}

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
    if (segment.refinementStatus === 'COMPLETED') {
      if (
        segment.draftText === undefined ||
        segment.refinedText === undefined ||
        !segment.isFinal
      )
        return failed(
          reference,
          internalError('Completed segment has invalid refinement state'),
        )
      return publishCanonical({
        dependencies,
        reference,
        connection: sessionResult.value.connection,
        text: segment.refinedText,
        completedAtStart: true,
      })
    }
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
    if (saved.kind === 'already_completed')
      return acknowledged(reference, 'already_completed')
    if (saved.kind === 'not_current')
      return acknowledged(reference, 'stale')
    if (saved.kind === 'invalid_state')
      return failed(
        reference,
        internalError('Conditional refined save found invalid state'),
      )
    if (saved.kind === 'failed') return failed(reference, saved.error)
    if (saved.segment.refinedText === undefined)
      return failed(
        reference,
        internalError('Stored refined result has no refined text'),
      )

    return publishCanonical({
      dependencies,
      reference,
      connection: sessionResult.value.connection,
      text: saved.segment.refinedText,
      completedAtStart: false,
    })
  }
