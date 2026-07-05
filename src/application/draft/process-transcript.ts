import {
  APPLICATION_ERROR_RETRYABILITY,
  type ApplicationError,
  type Revision,
  type Segment,
  type Session,
} from '../../domain'
import type {
  DraftTranslator,
  RefinementQueue,
  SessionConnection,
  SessionRevisionReference,
  SessionStateRepository,
  SubtitlePublisher,
  TranscriptRevisionInput,
} from '../../ports'
import { reportCorrelatedError } from './error-publication'
import { enqueueFinal } from './final-enqueue'

export interface ProcessTranscriptInput extends TranscriptRevisionInput {}
export interface ProcessTranscriptDependencies {
  repository: SessionStateRepository
  translator: DraftTranslator
  publisher: SubtitlePublisher
  refinementQueue: RefinementQueue
}
export type ProcessTranscriptResult =
  | { kind: 'stale'; submittedRevision: Revision; currentRevision: Revision }
  | {
      kind: 'superseded'
      attemptedRevision: Revision
      currentRevision?: Revision | undefined
    }
  | {
      kind: 'published'
      reference: SessionRevisionReference
      isFinal: false
    }
  | { kind: 'queued'; reference: SessionRevisionReference }
  | { kind: 'already_queued'; reference: SessionRevisionReference }
  | { kind: 'already_completed'; reference: SessionRevisionReference }
  | {
      kind: 'queue_pending'
      reference: SessionRevisionReference
      error: ApplicationError
    }
  | { kind: 'failed'; error: ApplicationError }

const applicationError = (
  code: 'SESSION_NOT_FOUND' | 'CONNECTION_GONE' | 'INTERNAL_ERROR',
  message: string,
): ApplicationError => ({
  code,
  message,
  retryable: APPLICATION_ERROR_RETRYABILITY[code],
})
const toReference = (
  input: TranscriptRevisionInput,
): SessionRevisionReference => ({
  sessionId: input.sessionId,
  segmentId: input.segmentId,
  sequence: input.sequence,
  revision: input.revision,
})

const reportFailure = async (
  input: {
    dependencies: ProcessTranscriptDependencies
    processInput: ProcessTranscriptInput
    connection: SessionConnection
  },
  stage: 'draft' | 'refinement_queue',
  error: ApplicationError,
): Promise<ProcessTranscriptResult> => {
  const reported = await reportCorrelatedError({
    publisher: input.dependencies.publisher,
    connection: input.connection,
    publication: {
      stage,
      reference: toReference(input.processInput),
      error,
    },
  })
  return reported.kind === 'reported'
    ? { kind: 'failed', error }
    : { kind: 'failed', error: reported.error }
}

const publishDraft = async (input: {
  dependencies: ProcessTranscriptDependencies
  connection: SessionConnection
  segment: Segment
}): Promise<
  | ProcessTranscriptResult
  | { kind: 'published_final'; reference: SessionRevisionReference }
> => {
  const reference = toReference(input.segment)
  if (input.segment.draftText === undefined) {
    return {
      kind: 'failed',
      error: applicationError(
        'INTERNAL_ERROR',
        'Stored draft result has no draft text',
      ),
    }
  }
  const result = await input.dependencies.publisher.publishDraft(
    input.connection,
    {
      reference,
      text: input.segment.draftText,
      isFinal: input.segment.isFinal,
    },
  )
  if (result.kind === 'failed') return result
  return input.segment.isFinal
    ? { kind: 'published_final', reference }
    : { kind: 'published', reference, isFinal: false }
}

const translateAndSave = async (input: {
  dependencies: ProcessTranscriptDependencies
  processInput: ProcessTranscriptInput
  session: Session
  connection: SessionConnection
}): Promise<ProcessTranscriptResult> => {
  const translated = await input.dependencies.translator.translate({
    sourceText: input.processInput.sourceText,
    sourceLanguage: input.session.sourceLanguage,
    targetLanguage: input.session.targetLanguage,
  })
  if (translated.kind === 'failed')
    return reportFailure(input, 'draft', translated.error)
  const saved = await input.dependencies.repository.saveDraft({
    reference: toReference(input.processInput),
    isFinal: input.processInput.isFinal,
    draftText: translated.text,
  })
  if (saved.kind === 'not_current') {
    return {
      kind: 'superseded',
      attemptedRevision: saved.attemptedRevision,
      currentRevision: saved.currentRevision,
    }
  }
  if (saved.kind === 'already_stored') {
    return {
      kind: 'superseded',
      attemptedRevision: input.processInput.revision,
      currentRevision: saved.segment.revision,
    }
  }
  if (saved.kind === 'failed') return reportFailure(input, 'draft', saved.error)
  const published = await publishDraft({
    dependencies: input.dependencies,
    connection: input.connection,
    segment: saved.segment,
  })
  if (published.kind !== 'published_final') return published
  return enqueueFinal({
    repository: input.dependencies.repository,
    refinementQueue: input.dependencies.refinementQueue,
    publisher: input.dependencies.publisher,
    connection: input.connection,
    reference: published.reference,
  })
}

const processDuplicate = async (input: {
  dependencies: ProcessTranscriptDependencies
  processInput: ProcessTranscriptInput
  session: Session
  connection: SessionConnection
  segment: Segment
}): Promise<ProcessTranscriptResult> => {
  const inconsistent = (message: string) =>
    applicationError('INTERNAL_ERROR', message)
  if (input.segment.draftText === undefined) {
    if (input.segment.refinementStatus || input.segment.refinedText)
      return reportFailure(
        input,
        'draft',
        inconsistent('Segment refinement state exists without a draft'),
      )
    return translateAndSave(input)
  }
  if (!input.segment.isFinal) {
    if (input.segment.refinementStatus || input.segment.refinedText)
      return reportFailure(
        input,
        'draft',
        inconsistent('Partial segment contains refinement state'),
      )
    const published = await publishDraft({
      dependencies: input.dependencies,
      connection: input.connection,
      segment: input.segment,
    })
    return published.kind === 'published_final'
      ? {
          kind: 'failed',
          error: inconsistent('Partial segment produced a final publication'),
        }
      : published
  }
  const reference = toReference(input.segment)
  if (input.segment.refinementStatus === 'QUEUED')
    return { kind: 'already_queued', reference }
  if (input.segment.refinementStatus === 'COMPLETED')
    return { kind: 'already_completed', reference }
  if (input.segment.refinementStatus !== 'PENDING')
    return reportFailure(
      input,
      'refinement_queue',
      inconsistent('Final draft has no valid refinement status'),
    )
  const published = await publishDraft({
    dependencies: input.dependencies,
    connection: input.connection,
    segment: input.segment,
  })
  if (published.kind !== 'published_final') return published
  return enqueueFinal({
    repository: input.dependencies.repository,
    refinementQueue: input.dependencies.refinementQueue,
    publisher: input.dependencies.publisher,
    connection: input.connection,
    reference: published.reference,
  })
}

export const createProcessTranscript =
  (dependencies: ProcessTranscriptDependencies) =>
  async (input: ProcessTranscriptInput): Promise<ProcessTranscriptResult> => {
    const sessionResult = await dependencies.repository.getSession(
      input.sessionId,
    )
    if (sessionResult.kind === 'not_found')
      return {
        kind: 'failed',
        error: applicationError(
          'SESSION_NOT_FOUND',
          'Translation session was not found',
        ),
      }
    if (sessionResult.kind === 'failed') return sessionResult
    if (!sessionResult.value.connection)
      return {
        kind: 'failed',
        error: applicationError(
          'CONNECTION_GONE',
          'Translation session has no active connection',
        ),
      }
    const base = {
      dependencies,
      processInput: input,
      session: sessionResult.value.session,
      connection: sessionResult.value.connection,
    }
    const acceptance =
      await dependencies.repository.acceptTranscriptRevision(input)
    if (acceptance.kind === 'stale') return acceptance
    if (acceptance.kind === 'rejected' || acceptance.kind === 'failed')
      return reportFailure(base, 'draft', acceptance.error)
    if (acceptance.kind === 'duplicate')
      return processDuplicate({ ...base, segment: acceptance.segment })
    return translateAndSave(base)
  }
