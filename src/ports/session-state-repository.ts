import type {
  ApplicationError,
  MediaOffsetMilliseconds,
  RefinementStatus,
  Revision,
  Segment,
  SegmentId,
  Sequence,
  Session,
  SessionId,
  TranslationContext,
} from '../domain'
import type { SessionConnection } from './session-lifecycle-repository'

export interface SessionRevisionReference {
  sessionId: SessionId
  segmentId: SegmentId
  sequence: Sequence
  revision: Revision
}

export interface TranscriptRevisionInput extends SessionRevisionReference {
  sourceText: string
  isFinal: boolean
  startMs: MediaOffsetMilliseconds
  endMs: MediaOffsetMilliseconds
}

export interface StoredSession {
  session: Session
  connection?: SessionConnection
}

export type GetSessionResult =
  | { kind: 'found'; value: StoredSession }
  | { kind: 'not_found' }
  | { kind: 'failed'; error: ApplicationError }

export type AcceptTranscriptRevisionResult =
  | { kind: 'accepted'; revision: Revision }
  | { kind: 'duplicate'; segment: Segment }
  | {
      kind: 'stale'
      submittedRevision: Revision
      currentRevision: Revision
    }
  | { kind: 'rejected'; error: ApplicationError }
  | { kind: 'failed'; error: ApplicationError }

export type SaveDraftResult =
  | { kind: 'stored'; segment: Segment }
  | { kind: 'already_stored'; segment: Segment }
  | {
      kind: 'not_current'
      attemptedRevision: Revision
      currentRevision?: Revision
    }
  | { kind: 'failed'; error: ApplicationError }

export type MarkRefinementQueuedResult =
  | { kind: 'queued' }
  | { kind: 'already_queued' }
  | { kind: 'already_completed' }
  | {
      kind: 'not_current'
      attemptedRevision: Revision
      currentRevision?: Revision
    }
  | { kind: 'invalid_state'; status?: RefinementStatus }
  | { kind: 'failed'; error: ApplicationError }

export type GetSegmentResult =
  | { kind: 'found'; segment: Segment }
  | { kind: 'not_found' }
  | { kind: 'failed'; error: ApplicationError }

export type SaveRefinedResult =
  | { kind: 'stored'; segment: Segment }
  | { kind: 'already_completed'; segment: Segment }
  | {
      kind: 'not_current'
      attemptedRevision: Revision
      currentRevision?: Revision
    }
  | { kind: 'invalid_state'; status?: RefinementStatus }
  | { kind: 'failed'; error: ApplicationError }

export type GetPreviousFinalSegmentsResult =
  | { kind: 'loaded'; context: TranslationContext }
  | { kind: 'rejected'; error: ApplicationError }
  | { kind: 'failed'; error: ApplicationError }

export interface SessionStateRepository {
  getSession(sessionId: SessionId): Promise<GetSessionResult>
  acceptTranscriptRevision(
    input: TranscriptRevisionInput,
  ): Promise<AcceptTranscriptRevisionResult>
  saveDraft(input: {
    reference: SessionRevisionReference
    isFinal: boolean
    draftText: string
  }): Promise<SaveDraftResult>
  markRefinementQueued(
    reference: SessionRevisionReference,
  ): Promise<MarkRefinementQueuedResult>
  getSegment(reference: SessionRevisionReference): Promise<GetSegmentResult>
  saveRefined(input: {
    reference: SessionRevisionReference
    refinedText: string
  }): Promise<SaveRefinedResult>
  getPreviousFinalSegments(input: {
    sessionId: SessionId
    beforeSequence: Sequence
    limit: number
  }): Promise<GetPreviousFinalSegmentsResult>
}
