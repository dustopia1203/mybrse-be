import {
  APPLICATION_ERROR_RETRYABILITY,
  type ApplicationError,
} from '../../domain'
import type {
  RefinementQueue,
  SessionConnection,
  SessionRevisionReference,
  SessionStateRepository,
  SubtitlePublisher,
} from '../../ports'
import { reportCorrelatedError } from './error-publication'
import type { ProcessTranscriptResult } from './process-transcript'

interface EnqueueFinalInput {
  repository: SessionStateRepository
  refinementQueue: RefinementQueue
  publisher: SubtitlePublisher
  connection: SessionConnection
  reference: SessionRevisionReference
}

const invalidRefinementStateError = (): ApplicationError => ({
  code: 'INTERNAL_ERROR',
  message: 'Refinement state is invalid for the current final revision',
  retryable: APPLICATION_ERROR_RETRYABILITY.INTERNAL_ERROR,
})

const reportQueueStateFailure = async (
  input: EnqueueFinalInput,
  error: ApplicationError,
): Promise<ProcessTranscriptResult> => {
  const reported = await reportCorrelatedError({
    publisher: input.publisher,
    connection: input.connection,
    publication: {
      stage: 'refinement_queue',
      reference: input.reference,
      error,
    },
  })
  return reported.kind === 'reported'
    ? { kind: 'queue_pending', reference: input.reference, error }
    : { kind: 'failed', error: reported.error }
}

export const enqueueFinal = async (
  input: EnqueueFinalInput,
): Promise<ProcessTranscriptResult> => {
  const enqueued = await input.refinementQueue.enqueue(input.reference)
  if (enqueued.kind === 'failed') {
    return reportQueueStateFailure(input, enqueued.error)
  }
  const marked = await input.repository.markRefinementQueued(input.reference)
  switch (marked.kind) {
    case 'queued':
      return { kind: 'queued', reference: input.reference }
    case 'already_queued':
      return { kind: 'already_queued', reference: input.reference }
    case 'already_completed':
      return { kind: 'already_completed', reference: input.reference }
    case 'not_current':
      return {
        kind: 'superseded',
        attemptedRevision: marked.attemptedRevision,
        currentRevision: marked.currentRevision,
      }
    case 'invalid_state':
      return reportQueueStateFailure(input, invalidRefinementStateError())
    case 'failed':
      return reportQueueStateFailure(input, marked.error)
  }
}
